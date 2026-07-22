import { describe, expect, it } from 'vitest';
import { detectContainerPort } from './container-port.js';

// This function is a direct fix for a real bug found during Milestone 4:
// a deployment defaulted to port 3000 while the actual app (Flask) listened
// on 5000, causing a real crash-loop in a live Minikube cluster. These
// cases are regression tests for that, not just coverage padding.
describe('detectContainerPort', () => {
  it('parses the port from a Dockerfile EXPOSE directive', () => {
    const dockerfile = 'FROM python:3.11-slim\nEXPOSE 5000\nCMD ["python", "app.py"]';
    expect(detectContainerPort(dockerfile, 'dockerfile-present')).toBe(5000);
  });

  it('is case-insensitive and tolerates leading whitespace', () => {
    const dockerfile = 'FROM node:20\n  expose 8080\nCMD ["npm", "start"]';
    expect(detectContainerPort(dockerfile, 'node')).toBe(8080);
  });

  it('falls back to 3000 when there is no EXPOSE directive', () => {
    const dockerfile = 'FROM python:3.11-slim\nCMD ["python", "app.py"]';
    expect(detectContainerPort(dockerfile, 'dockerfile-present')).toBe(3000);
  });

  it('uses the first EXPOSE when a Dockerfile declares more than one', () => {
    const dockerfile = 'FROM node:20\nEXPOSE 3000\nEXPOSE 9229\nCMD ["npm", "start"]';
    expect(detectContainerPort(dockerfile, 'node')).toBe(3000);
  });

  it('always returns 80 for static projects regardless of EXPOSE', () => {
    const dockerfile = 'FROM nginx:alpine\nCOPY . /usr/share/nginx/html';
    expect(detectContainerPort(dockerfile, 'static')).toBe(80);
  });
});
