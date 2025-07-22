const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

const songsPath = path.join(__dirname, 'public', 'songs');
app.use(express.static(path.join(__dirname, 'public')));

// API: Get all playlists and songs inside
app.get('/songs', (req, res) => {
  const playlists = {};
  fs.readdir(songsPath, { withFileTypes: true }, (err, dirs) => {
    if (err) return res.status(500).send('Unable to read songs directory');

    const folderDirs = dirs.filter(dirent => dirent.isDirectory());

    folderDirs.forEach(dir => {
      const playlistName = dir.name;
      const playlistDir = path.join(songsPath, playlistName);

      try {
        const files = fs.readdirSync(playlistDir).filter(file =>
          file.endsWith('.mp3') || file.endsWith('.webm') || file.endsWith('.ogg')
        );


        console.log(`Playlist: ${playlistName}, Songs found: ${files.length}`);
        playlists[playlistName] = files;
      } catch (err) {
        console.error(`Error reading ${playlistName}:`, err);
        playlists[playlistName] = [];
      }
    });

    res.json(playlists);
  });
});


app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
