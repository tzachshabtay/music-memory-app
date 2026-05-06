import { useState, useEffect, useRef } from 'react';
import './App.css';
import { Song, GameState } from './types';

function App() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [songSelectionCounts, setSongSelectionCounts] = useState<Map<number, number>>(new Map());
  const [gameState, setGameState] = useState<GameState>({
    phase: 'playing',
    currentSong: null,
    startTime: 0,
    userAnswers: {
      composer: '',
      majorWork: '',
    },
    score: {
      composer: false,
      majorWork: false,
    },
    totalScore: 0,
    questionsAnswered: 0,
  });

  const audioRef = useRef<HTMLAudioElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Full song player state
  const fullSongAudioRef = useRef<HTMLAudioElement>(null);
  const [fullSongCurrentTime, setFullSongCurrentTime] = useState(0);
  const [fullSongDuration, setFullSongDuration] = useState(0);
  const [isFullSongPlaying, setIsFullSongPlaying] = useState(false);
  const fullSongProgressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load songs on mount
  useEffect(() => {
    fetch('/songs.json')
      .then(res => res.json())
      .then((data: Song[]) => {
        setSongs(data);
        selectRandomSong(data);
      })
      .catch(err => console.error('Error loading songs:', err));
  }, []);

  // Normalize strings for comparison: trim, lowercase, collapse multiple spaces, remove punctuation, remove accents
  const normalizeString = (str: string): string => {
    return str
      .trim()
      .normalize('NFD') // Decompose accented characters
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'"]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .trim();
  };

  // Check if two strings match, including aliases
  const isMatch = (userInput: string, correctAnswer: string, aliases: string[] = []): boolean => {
    const normalizedInput = normalizeString(userInput);
    const normalizedAnswer = normalizeString(correctAnswer);

    if (normalizedInput === normalizedAnswer) {
      return true;
    }

    // Check aliases
    for (const alias of aliases) {
      if (normalizedInput === normalizeString(alias)) {
        return true;
      }
    }

    return false;
  };

  // Get aliases for a song
  const getAliases = (song: Song): { composer: string[], majorWork: string[] } => {
    const aliases: { composer: string[], majorWork: string[] } = {
      composer: [],
      majorWork: [],
    };

    // Composer aliases
    if (song.Composer === 'Lloyd Webber') {
      aliases.composer = ['Webber', 'Andrew Lloyd Webber'];
    }
    if (song.Composer === 'R. Strauss') {
      aliases.composer = ['Strauss', 'Richard Strauss'];
    }
    if (song.Composer === 'M. Monk') {
      aliases.composer = ['Monk', 'Meredith Monk'];
    }

    // Major Work / Selection aliases
    const majorWorkOrSelection = song['Major Work'] || song.Selection;

    // Bach - Double is optional
    if (song.Composer === 'Bach' && majorWorkOrSelection.includes('Double')) {
      aliases.majorWork = [
        'Concerto for 2 Violins in D minor',
        'Concerto for 2 Violins',
        'Violin Concerto for 2 Violins in D minor',
      ];
    }

    // Mozart - Alleluia variations
    if (song.Composer === 'Mozart' && song.Selection === 'Alleluja') {
      aliases.majorWork = ['Exsultate jubilate Alleluia', 'Alleluia'];
    }

    return aliases;
  };

  // Select a random song from the group with minimum selections
  // This ensures even distribution - all songs are played before any repeats
  const selectRandomSong = (songList: Song[]) => {
    if (songList.length === 0) return;

    // Find the minimum selection count across all songs
    const minCount = Math.min(
      ...songList.map(song => songSelectionCounts.get(song.No) || 0)
    );

    // Filter to only songs with the minimum count
    const leastPlayedSongs = songList.filter(
      song => (songSelectionCounts.get(song.No) || 0) === minCount
    );

    // Randomly select from the least-played songs
    const randomSong = leastPlayedSongs[Math.floor(Math.random() * leastPlayedSongs.length)];

    console.log(`Selecting song #${randomSong.No}: ${randomSong['Major Work']} (count: ${songSelectionCounts.get(randomSong.No) || 0})`);
    console.log(`Least played songs available: ${leastPlayedSongs.map(s => s.No).join(', ')}`);

    // Load audio to get duration, then select random time
    const audio = new Audio(randomSong.playable_url);

    const handleMetadata = () => {
      const duration = audio.duration;
      // Ensure we have at least 20 seconds left to play
      const maxStartTime = Math.max(0, duration - 20);
      const startTime = Math.random() * maxStartTime;

      // Update selection count AFTER successful load
      setSongSelectionCounts(prev => {
        const newCounts = new Map(prev);
        newCounts.set(randomSong.No, (newCounts.get(randomSong.No) || 0) + 1);
        return newCounts;
      });

      setGameState({
        phase: 'playing',
        currentSong: randomSong,
        startTime: startTime,
        userAnswers: {
          composer: '',
          majorWork: '',
        },
        score: {
          composer: false,
          majorWork: false,
        },
        totalScore: gameState.totalScore,
        questionsAnswered: gameState.questionsAnswered,
      });
    };

    const handleError = (e: Event) => {
      console.error(`Failed to load audio for song #${randomSong.No}:`, e);
      // Try another song if this one fails
      selectRandomSong(songList);
    };

    audio.addEventListener('loadedmetadata', handleMetadata, { once: true });
    audio.addEventListener('error', handleError, { once: true });
  };

  // Load audio when a new song is selected
  useEffect(() => {
    if (gameState.currentSong && audioRef.current && gameState.phase === 'playing') {
      const audio = audioRef.current;
      audio.src = gameState.currentSong.playable_url;
      setCurrentTime(0);
      setIsPlaying(false);

      // Set the start time when audio is ready
      const handleCanPlay = () => {
        audio.currentTime = gameState.startTime;
      };

      audio.addEventListener('canplay', handleCanPlay, { once: true });
      audio.load();

      return () => {
        audio.removeEventListener('canplay', handleCanPlay);
      };
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [gameState.currentSong, gameState.startTime, gameState.phase]);

  const handlePlayPause = () => {
    if (audioRef.current) {
      const audio = audioRef.current;
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      } else {
        audio.play();
        setIsPlaying(true);

        // Resume progress tracking
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
        progressIntervalRef.current = setInterval(() => {
          const elapsed = audio.currentTime - gameState.startTime;
          if (elapsed >= 20) {
            audio.pause();
            setIsPlaying(false);
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
            }
          } else {
            setCurrentTime(Math.max(0, elapsed));
          }
        }, 100);

        // Reset 20-second timer based on remaining time
        const remainingTime = (20 - currentTime) * 1000;
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          audio.pause();
          setIsPlaying(false);
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
          }
        }, remainingTime);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTime = parseFloat(e.target.value);
    setCurrentTime(seekTime);

    if (audioRef.current && gameState.currentSong) {
      const audio = audioRef.current;
      audio.currentTime = gameState.startTime + seekTime;

      // If playing, restart the timer for remaining time
      if (isPlaying) {
        const remainingTime = (20 - seekTime) * 1000;
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          audio.pause();
          setIsPlaying(false);
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
          }
        }, remainingTime);
      }
    }
  };

  const handleRestart = () => {
    if (audioRef.current && gameState.currentSong) {
      const audio = audioRef.current;
      audio.currentTime = gameState.startTime;
      setCurrentTime(0);
      audio.play();
      setIsPlaying(true);

      // Clear existing intervals/timeouts
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Restart progress tracking
      progressIntervalRef.current = setInterval(() => {
        const elapsed = audio.currentTime - gameState.startTime;
        if (elapsed >= 20) {
          audio.pause();
          setIsPlaying(false);
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
          }
        } else {
          setCurrentTime(Math.max(0, elapsed));
        }
      }, 100);

      // Reset 20-second timer
      timeoutRef.current = setTimeout(() => {
        audio.pause();
        setIsPlaying(false);
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
      }, 20000);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!gameState.currentSong) return;

    const { composer, majorWork } = gameState.userAnswers;
    const song = gameState.currentSong;
    const aliases = getAliases(song);

    // Check composer
    const composerCorrect = isMatch(composer, song.Composer, aliases.composer);

    // Check major work - use Selection if Major Work is empty
    const correctMajorWork = song["Major Work"] || song.Selection;
    const majorWorkCorrect = isMatch(majorWork, correctMajorWork, aliases.majorWork);

    const pointsEarned = [composerCorrect, majorWorkCorrect].filter(Boolean).length;

    setGameState({
      ...gameState,
      phase: 'answered',
      score: {
        composer: composerCorrect,
        majorWork: majorWorkCorrect,
      },
      totalScore: gameState.totalScore + pointsEarned,
      questionsAnswered: gameState.questionsAnswered + 1,
    });

    // Stop audio
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  const handleNextSong = () => {
    // Stop full song if playing
    if (fullSongAudioRef.current) {
      fullSongAudioRef.current.pause();
      setIsFullSongPlaying(false);
      setFullSongCurrentTime(0);
      if (fullSongProgressIntervalRef.current) {
        clearInterval(fullSongProgressIntervalRef.current);
      }
    }
    selectRandomSong(songs);
  };

  // Full song player handlers
  const handleFullSongPlayPause = () => {
    if (fullSongAudioRef.current) {
      const audio = fullSongAudioRef.current;
      if (isFullSongPlaying) {
        audio.pause();
        setIsFullSongPlaying(false);
        if (fullSongProgressIntervalRef.current) {
          clearInterval(fullSongProgressIntervalRef.current);
        }
      } else {
        audio.play();
        setIsFullSongPlaying(true);

        // Start progress tracking
        if (fullSongProgressIntervalRef.current) {
          clearInterval(fullSongProgressIntervalRef.current);
        }
        fullSongProgressIntervalRef.current = setInterval(() => {
          if (audio.currentTime >= audio.duration) {
            audio.pause();
            setIsFullSongPlaying(false);
            if (fullSongProgressIntervalRef.current) {
              clearInterval(fullSongProgressIntervalRef.current);
            }
          } else {
            setFullSongCurrentTime(audio.currentTime);
          }
        }, 100);
      }
    }
  };

  const handleFullSongSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTime = parseFloat(e.target.value);
    setFullSongCurrentTime(seekTime);

    if (fullSongAudioRef.current) {
      fullSongAudioRef.current.currentTime = seekTime;
    }
  };

  // Load full song when results are shown
  useEffect(() => {
    if (gameState.phase === 'answered' && gameState.currentSong && fullSongAudioRef.current) {
      const audio = fullSongAudioRef.current;
      audio.src = gameState.currentSong.playable_url;
      audio.addEventListener('loadedmetadata', () => {
        setFullSongDuration(audio.duration);
        setFullSongCurrentTime(0);
      });
    }

    return () => {
      if (fullSongProgressIntervalRef.current) {
        clearInterval(fullSongProgressIntervalRef.current);
      }
    };
  }, [gameState.phase, gameState.currentSong]);

  const handleInputChange = (field: 'composer' | 'majorWork', value: string) => {
    setGameState({
      ...gameState,
      userAnswers: {
        ...gameState.userAnswers,
        [field]: value,
      },
    });
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Update progress bar background
  useEffect(() => {
    const slider = document.querySelector('.progress-slider') as HTMLInputElement;
    if (slider) {
      const progress = (currentTime / 20) * 100;
      slider.style.setProperty('--progress', `${progress}%`);
    }
  }, [currentTime]);

  // Update full song progress bar background
  useEffect(() => {
    const slider = document.querySelector('.full-song-progress-slider') as HTMLInputElement;
    if (slider && fullSongDuration > 0) {
      const progress = (fullSongCurrentTime / fullSongDuration) * 100;
      slider.style.setProperty('--progress', `${progress}%`);
    }
  }, [fullSongCurrentTime, fullSongDuration]);

  if (songs.length === 0 || !gameState.currentSong) {
    return <div className="loading">Loading songs...</div>;
  }

  return (
    <div className="app">
      <header>
        <div className="profile-image-container">
          <img src="/ethan.png" alt="Ethan" className="profile-image" />
        </div>
        <h1>Music Memory Practice</h1>
        <p className="subtitle">Ethan's Practice Session</p>
        <div className="score-display">
          Score: {gameState.totalScore} / {gameState.questionsAnswered * 2}
          {gameState.questionsAnswered > 0 && (
            <span className="percentage">
              {' '}({Math.round((gameState.totalScore / (gameState.questionsAnswered * 2)) * 100)}%)
            </span>
          )}
        </div>
      </header>

      <main>
        <audio ref={audioRef} />

        <div className="audio-player">
          <div className="player-controls">
            <button onClick={handleRestart} className="control-btn restart-btn" title="Restart">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
              </svg>
            </button>

            <button onClick={handlePlayPause} className="control-btn play-pause-btn" title={isPlaying ? "Pause" : "Play"}>
              {isPlaying ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1"/>
                  <rect x="14" y="4" width="4" height="16" rx="1"/>
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>
          </div>

          <div className="progress-container">
            <span className="time-display">{formatTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max="20"
              step="0.1"
              value={currentTime}
              onChange={handleSeek}
              className="progress-slider"
            />
            <span className="time-display">0:{(20).toString().padStart(2, '0')}</span>
          </div>
        </div>

        {gameState.phase === 'playing' ? (
          <form onSubmit={handleSubmit} className="answer-form">
            <div className="input-group">
              <label htmlFor="composer">Composer:</label>
              <input
                type="text"
                id="composer"
                value={gameState.userAnswers.composer}
                onChange={(e) => handleInputChange('composer', e.target.value)}
                autoFocus
                autoComplete="off"
              />
            </div>

            <div className="input-group">
              <label htmlFor="majorWork">Major Work:</label>
              <select
                id="majorWork"
                value={gameState.userAnswers.majorWork}
                onChange={(e) => handleInputChange('majorWork', e.target.value)}
                className="major-work-select"
              >
                <option value="">Select a song...</option>
                {songs.map((song) => {
                  const displayName = song["Major Work"] || song.Selection;
                  return (
                    <option key={song.No} value={displayName}>
                      {displayName}
                    </option>
                  );
                })}
              </select>
            </div>

            <button
              type="submit"
              className="submit-btn"
              disabled={!gameState.userAnswers.composer || !gameState.userAnswers.majorWork}
            >
              Submit Answer
            </button>
          </form>
        ) : (
          <div className="results">
            <h2>Results</h2>
            <div className="points-earned">
              Points: {[gameState.score.composer, gameState.score.majorWork]
                .filter(Boolean).length} / 2
            </div>

            <div className="song-info">
              <div className="song-detail">
                <span className="song-label">Timestamp:</span>
                <span className="song-value">{formatTime(gameState.startTime)}</span>
              </div>
              <div className="song-detail">
                <span className="song-label">Song #{gameState.currentSong.No}</span>
              </div>
            </div>

            <div className="answer-comparison">
              <div className={`answer-row ${gameState.score.composer ? 'correct' : 'incorrect'}`}>
                <span className="label">Composer:</span>
                <span className="user-answer">{gameState.userAnswers.composer || '(empty)'}</span>
                <span className="arrow">→</span>
                <span className="correct-answer">{gameState.currentSong.Composer}</span>
              </div>

              <div className={`answer-row ${gameState.score.majorWork ? 'correct' : 'incorrect'}`}>
                <span className="label">Major Work:</span>
                <span className="user-answer">{gameState.userAnswers.majorWork || '(empty)'}</span>
                <span className="arrow">→</span>
                <span className="correct-answer">
                  {gameState.currentSong["Major Work"] || gameState.currentSong.Selection}
                </span>
              </div>

              {gameState.currentSong.Selection && (
                <div className="answer-row info-only">
                  <span className="label">Selection:</span>
                  <span className="correct-answer">{gameState.currentSong.Selection}</span>
                </div>
              )}
            </div>

            {gameState.currentSong.Notes && (
              <div className="notes">
                <strong>Notes:</strong> {gameState.currentSong.Notes}
              </div>
            )}

            <div className="full-song-player">
              <audio ref={fullSongAudioRef} />
              <h3 className="full-song-title">Listen to Full Song</h3>

              <div className="full-song-controls">
                <button
                  onClick={handleFullSongPlayPause}
                  className="full-song-btn play-pause-btn-small"
                  title={isFullSongPlaying ? "Pause" : "Play"}
                >
                  {isFullSongPlaying ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1"/>
                      <rect x="14" y="4" width="4" height="16" rx="1"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>

                <div className="full-song-progress-container">
                  <span className="time-display-small">{formatTime(fullSongCurrentTime)}</span>
                  <input
                    type="range"
                    min="0"
                    max={fullSongDuration}
                    step="0.1"
                    value={fullSongCurrentTime}
                    onChange={handleFullSongSeek}
                    className="full-song-progress-slider"
                  />
                  <span className="time-display-small">{formatTime(fullSongDuration)}</span>
                </div>
              </div>
            </div>

            <button onClick={handleNextSong} className="next-btn">
              Next Song &#8594;
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
