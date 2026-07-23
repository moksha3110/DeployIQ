import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import { prisma } from '../../prisma/client.js';
import { computeHealthScore } from './health-score.js';
import { computeSecurityScore } from './security-score.js';
import { computeCostForDeployment } from './cost.js';
import { generateRecommendations } from './recommend.js';
import { scanIncidents } from './incidents.js';
import type { DeploymentQueryContext } from './query.js';

export interface ReportContext extends DeploymentQueryContext {
  status: string;
  publicUrl: string | null;
}

const COLORS = {
  heading: '#0f172a',
  body: '#334155',
  muted: '#94a3b8',
  rule: '#e2e8f0',
  good: '#16a34a',
  warn: '#d97706',
  bad: '#dc2626',
};

function severityColor(v: number, goodAt: number, badAt: number): string {
  if (v >= goodAt) return COLORS.good;
  if (v <= badAt) return COLORS.bad;
  return COLORS.warn;
}

function sectionHeading(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.8);
  doc.fontSize(14).fillColor(COLORS.heading).text(title, { underline: false });
  const y = doc.y + 2;
  doc
    .moveTo(doc.x, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .strokeColor(COLORS.rule)
    .stroke();
  doc.moveDown(0.5);
}

function bodyLine(doc: PDFKit.PDFDocument, text: string, color = COLORS.body) {
  doc.fontSize(10).fillColor(color).text(text, { align: 'left' });
}

// Gathers every analysis source independently — a single failing source
// (e.g. AI not configured, so recommendations come back empty) must not
// prevent the rest of the report from being generated. This mirrors the
// same tolerance-of-partial-failure the individual REST endpoints already
// have, just fanned out across all of them at once.
async function gatherReportData(ctx: ReportContext) {
  const [health, security, cost, recommendations, incidents] = await Promise.all([
    computeHealthScore(ctx.namespace, ctx.appName).catch(() => null),
    computeSecurityScore(ctx.namespace, ctx.appName).catch(() => null),
    computeCostForDeployment(ctx.namespace, ctx.appName).catch(() => null),
    generateRecommendations(ctx.namespace, ctx.appName).catch(() => ({
      recommendations: [],
      aiConfigured: false,
    })),
    scanIncidents(ctx.deploymentId, ctx.namespace, ctx.appName)
      .then(() =>
        prisma.incident.findMany({
          where: { deploymentId: ctx.deploymentId },
          orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }],
          take: 20,
        }),
      )
      .catch(() => []),
  ]);

  return { health, security, cost, recommendations, incidents };
}

export async function streamDeploymentReport(res: Response, ctx: ReportContext): Promise<void> {
  const data = await gatherReportData(ctx);

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="deployiq-report-${ctx.namespace}.pdf"`,
  );
  doc.pipe(res);

  doc.fontSize(20).fillColor(COLORS.heading).text('DeployIQ Infrastructure Report');
  doc
    .fontSize(11)
    .fillColor(COLORS.muted)
    .text(`${ctx.repositoryFullName} — ${ctx.branch}@${ctx.commitSha.slice(0, 7)}`);
  doc
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text(
      `Namespace: ${ctx.namespace} | Status: ${ctx.status} | Generated ${new Date().toLocaleString()}`,
    );
  if (ctx.publicUrl) doc.fontSize(9).fillColor(COLORS.muted).text(`URL: ${ctx.publicUrl}`);

  // Health score
  sectionHeading(doc, 'Health Score');
  if (data.health) {
    doc
      .fontSize(28)
      .fillColor(severityColor(data.health.score, 75, 50))
      .text(`${data.health.score}/100`, { continued: true })
      .fontSize(12)
      .fillColor(COLORS.muted)
      .text(`  ${data.health.label}`);
    doc.moveDown(0.3);
    if (data.health.factors.length === 0) {
      bodyLine(doc, 'No issues detected.');
    }
    for (const f of data.health.factors) {
      bodyLine(doc, `- ${f.reason} (-${f.deduction})`);
    }
  } else {
    bodyLine(
      doc,
      'Unavailable — this deployment has no live infrastructure right now.',
      COLORS.muted,
    );
  }

  // Security
  sectionHeading(doc, 'Security Score');
  if (data.security) {
    doc
      .fontSize(20)
      .fillColor(severityColor(data.security.score, 75, 50))
      .text(`${data.security.grade} (${data.security.score}/100)`);
    doc.moveDown(0.3);
    if (data.security.findings.length === 0) {
      bodyLine(doc, 'No findings.');
    }
    for (const f of data.security.findings) {
      bodyLine(doc, `- [${f.severity.toUpperCase()}] ${f.title}`);
      doc.fontSize(9).fillColor(COLORS.muted).text(`  ${f.description}`, { indent: 10 });
    }
  } else {
    bodyLine(doc, 'Unavailable.', COLORS.muted);
  }

  // Cost
  sectionHeading(doc, 'Estimated Monthly Cost');
  if (data.cost) {
    doc
      .fontSize(20)
      .fillColor(COLORS.heading)
      .text(`$${data.cost.monthlyCost.toFixed(2)}/mo`);
    bodyLine(
      doc,
      `${data.cost.replicas} replica(s) x ${data.cost.requestedCpuCores.toFixed(2)} vCPU / ${data.cost.requestedMemoryGB.toFixed(2)} GB requested.`,
    );
    if (data.cost.potentialMonthlySavings > 0.5) {
      bodyLine(
        doc,
        `Right-sizing to actual usage could save ~$${data.cost.potentialMonthlySavings.toFixed(2)}/mo.`,
        COLORS.good,
      );
    }
  } else {
    bodyLine(doc, 'Unavailable.', COLORS.muted);
  }

  // Incidents
  sectionHeading(doc, 'Incidents');
  if (data.incidents.length === 0) {
    bodyLine(doc, 'No incidents recorded.');
  }
  for (const incident of data.incidents) {
    const isOpen = incident.status === 'OPEN';
    doc
      .fontSize(10)
      .fillColor(isOpen ? COLORS.bad : COLORS.muted)
      .text(`- [${incident.priority}] ${incident.type}${isOpen ? '' : ' (resolved)'}`);
    doc.fontSize(9).fillColor(COLORS.muted).text(`  ${incident.rootCause}`, { indent: 10 });
  }

  // Recommendations
  sectionHeading(doc, 'AI Recommendations');
  if (!data.recommendations.aiConfigured) {
    bodyLine(doc, 'Unavailable — no ANTHROPIC_API_KEY configured.', COLORS.muted);
  } else if (data.recommendations.recommendations.length === 0) {
    bodyLine(doc, 'No recommendations — this deployment looks well-configured.');
  } else {
    for (const rec of data.recommendations.recommendations) {
      doc
        .fontSize(10)
        .fillColor(COLORS.body)
        .text(`- [${rec.severity.toUpperCase()}] ${rec.problem}`);
      doc.fontSize(9).fillColor(COLORS.muted).text(`  Fix: ${rec.fix}`, { indent: 10 });
    }
  }

  doc.end();
}
