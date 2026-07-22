import { Route, Routes } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';

// Routes grow starting Milestone 1 (login) and Milestone 2 (repo/deployment
// pages) — kept flat here rather than a router config file until there's
// enough of them to justify one.
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
    </Routes>
  );
}
