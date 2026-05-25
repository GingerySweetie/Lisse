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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:conversationId" element={<ChatPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/personas" element={<PersonasPage />} />
          <Route path="/styles" element={<StylesPage />} />
          <Route path="/books" element={<BooksPage />} />
          <Route path="/read/:bookId" element={<ReadPage />} />
          <Route path="/memory" element={<MemoryPage />} />
          <Route path="/data" element={<ImportExportPage />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Route>
      </Routes>
      <UpdateBanner />
    </BrowserRouter>
  );
}
