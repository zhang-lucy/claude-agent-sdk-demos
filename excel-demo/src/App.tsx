import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ChatInterface from './components/ChatInterface';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<ChatInterface />} />
      </Routes>
    </Router>
  );
}
