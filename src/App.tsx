import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import UpdateBanner from './components/UpdateBanner';
import ChatPage from './pages/Chat';
import SettingsPage from './pages/Settings';
import PersonasPage from './pages/Personas';
import ImportExportPage from './pages/ImportExport';
import MemoryPage from './pages/Memory';
import StylesPage from './pages/Styles';
import BooksPage from './pages/Books';
import ReadPage from './pages/Read';
import HomePage from './pages/Home';
import BedroomPage from './pages/Bedroom';
import BillingPage from './pages/Billing';
import BodyPage from './pages/Body';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/bedroom" element={<BedroomPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/body" element={<BodyPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:conversationId" element={<ChatPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/personas" element={<PersonasPage />} />
          <Route path="/styles" element={<StylesPage />} />
          <Route path="/books" element={<BooksPage />} />
          <Route path="/read/:bookId" element={<ReadPage />} />
          <Route path="/memory" element={<MemoryPage />} />
          <Route path="/data" element={<ImportExportPage />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
      <UpdateBanner />
    </BrowserRouter>
  );
}
