import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Bills from "./pages/Bills";
import Settings from "./pages/Settings";
import Resources from "./pages/Resources";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/bills" element={<Bills />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/resources" element={<Resources />} />
      </Route>
    </Routes>
  );
}
