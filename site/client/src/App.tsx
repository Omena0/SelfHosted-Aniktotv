import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { AniListLibrary } from './pages/AniListLibrary';
import { AnimeDetail } from './pages/AnimeDetail';
import { Player } from './pages/Player';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="library" element={<Library />} />
          <Route path="anilist" element={<AniListLibrary />} />
          <Route path="anime/:slug" element={<AnimeDetail />} />
          <Route path="watch/:slug/:season/:file" element={<Player />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
