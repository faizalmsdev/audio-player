const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

const songsPath = path.join(__dirname, 'public', 'songs');
app.use(express.static(path.join(__dirname, 'public')));

// Enable CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

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

// API: Get metadata for a specific playlist
app.get('/metadata/:playlist', (req, res) => {
  const playlistName = req.params.playlist;
  const metadataPath = path.join(songsPath, playlistName, 'enhanced_download_summary.json');
  
  console.log(`Loading metadata for playlist: ${playlistName}`);
  console.log(`Metadata path: ${metadataPath}`);
  
  fs.readFile(metadataPath, 'utf8', (err, data) => {
    if (err) {
      console.log(`No metadata found for playlist: ${playlistName}`, err.message);
      return res.json({ download_results: [] });
    }
    
    try {
      const metadata = JSON.parse(data);
      console.log(`Metadata loaded for ${playlistName}: ${metadata.download_results?.length || 0} tracks`);
      
      // Ensure all required fields are present and log them
      if (metadata.download_results) {
        metadata.download_results.forEach((track, index) => {
          console.log(`Track ${index + 1}:`, {
            track_name: track.track_name,
            artists_string: track.metadata?.artists_string,
            cover_art_url: track.metadata?.cover_art_url,
            cover_art_filename: track.metadata?.cover_art_filename
          });
        });
      }
      
      res.json(metadata);
    } catch (parseErr) {
      console.error(`Error parsing metadata for ${playlistName}:`, parseErr);
      res.json({ download_results: [] });
    }
  });
});

// API: Serve cover art images from the playlist folder
app.get('/cover_art/:playlist/:filename', (req, res) => {
  const { playlist, filename } = req.params;
  
  // First try to find the cover art in the playlist folder
  const coverArtInPlaylist = path.join(songsPath, playlist, filename);
  
  console.log(`Looking for cover art: ${coverArtInPlaylist}`);
  
  fs.access(coverArtInPlaylist, fs.constants.F_OK, (err) => {
    if (!err) {
      console.log(`Found cover art in playlist folder: ${coverArtInPlaylist}`);
      return res.sendFile(path.resolve(coverArtInPlaylist));
    }
    
    // If not found in playlist folder, try the separate cover_art folder
    const coverArtPath = path.join(__dirname, 'public', 'cover_art', playlist, filename);
    
    fs.access(coverArtPath, fs.constants.F_OK, (err2) => {
      if (err2) {
        console.log(`Cover art not found in either location for: ${filename}`);
        return res.status(404).send('Cover art not found');
      }
      console.log(`Found cover art in cover_art folder: ${coverArtPath}`);
      res.sendFile(path.resolve(coverArtPath));
    });
  });
});

// API: Get detailed song info with metadata
app.get('/song-info/:playlist/:filename', (req, res) => {
  const { playlist, filename } = req.params;
  const metadataPath = path.join(songsPath, playlist, 'enhanced_download_summary.json');
  
  fs.readFile(metadataPath, 'utf8', (err, data) => {
    if (err) {
      return res.json({ 
        filename: filename,
        track_name: filename.replace(/\.[^/.]+$/, ""),
        artists_string: "Unknown Artist",
        cover_art_url: null
      });
    }
    
    try {
      const metadata = JSON.parse(data);
      const songData = metadata.download_results?.find(track => 
        track.filename === filename
      );
      
      if (songData) {
        res.json({
          filename: songData.filename,
          track_name: songData.track_name || songData.metadata?.track_name,
          artists_string: songData.metadata?.artists_string || songData.artists,
          cover_art_url: songData.metadata?.cover_art_url,
          cover_art_filename: songData.metadata?.cover_art_filename,
          album_name: songData.metadata?.album_name,
          duration_formatted: songData.metadata?.duration_formatted,
          playcount: songData.metadata?.playcount
        });
      } else {
        res.json({ 
          filename: filename,
          track_name: filename.replace(/\.[^/.]+$/, ""),
          artists_string: "Unknown Artist",
          cover_art_url: null
        });
      }
    } catch (parseErr) {
      console.error(`Error parsing metadata:`, parseErr);
      res.json({ 
        filename: filename,
        track_name: filename.replace(/\.[^/.]+$/, ""),
        artists_string: "Unknown Artist",
        cover_art_url: null
      });
    }
  });
});

// API: Get all songs with metadata for a playlist
app.get('/playlist/:playlist/songs', (req, res) => {
  const playlistName = req.params.playlist;
  const playlistDir = path.join(songsPath, playlistName);
  const metadataPath = path.join(playlistDir, 'enhanced_download_summary.json');
  
  // Get all audio files
  let audioFiles = [];
  try {
    audioFiles = fs.readdirSync(playlistDir).filter(file =>
      file.endsWith('.mp3') || file.endsWith('.webm') || file.endsWith('.ogg')
    );
  } catch (err) {
    return res.status(404).json({ error: 'Playlist not found' });
  }
  
  // Load metadata
  fs.readFile(metadataPath, 'utf8', (err, data) => {
    let metadata = { download_results: [] };
    
    if (!err) {
      try {
        metadata = JSON.parse(data);
      } catch (parseErr) {
        console.error(`Error parsing metadata:`, parseErr);
      }
    }
    
    // Combine audio files with metadata
    const songsWithMetadata = audioFiles.map(filename => {
      const metadataEntry = metadata.download_results?.find(track => 
        track.filename === filename
      );
      
      return {
        filename: filename,
        track_name: metadataEntry?.track_name || metadataEntry?.metadata?.track_name || filename.replace(/\.[^/.]+$/, ""),
        artists_string: metadataEntry?.metadata?.artists_string || metadataEntry?.artists || "Unknown Artist",
        cover_art_url: metadataEntry?.metadata?.cover_art_url,
        cover_art_filename: metadataEntry?.metadata?.cover_art_filename,
        album_name: metadataEntry?.metadata?.album_name,
        duration_formatted: metadataEntry?.metadata?.duration_formatted,
        playcount: metadataEntry?.metadata?.playcount,
        video_title: metadataEntry?.video_title
      };
    });
    
    res.json({
      playlist: playlistName,
      songs: songsWithMetadata,
      total_songs: songsWithMetadata.length
    });
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).send('Internal server error');
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('API Endpoints:');
  console.log('- GET /songs - Get all playlists');
  console.log('- GET /metadata/:playlist - Get metadata for playlist');
  console.log('- GET /playlist/:playlist/songs - Get songs with metadata');
  console.log('- GET /song-info/:playlist/:filename - Get individual song info');
  console.log('- GET /cover_art/:playlist/:filename - Get cover art');
  console.log('Features:');
  console.log('- Music streaming with metadata support');
  console.log('- Cover art display');
  console.log('- Mobile-friendly responsive design');
  console.log('- Search functionality');
  console.log('- Playlist management');
});