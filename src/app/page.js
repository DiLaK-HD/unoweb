"use client";

import { useState, useEffect, useCallback } from "react";
import { io } from "socket.io-client";
import styles from "./page.module.css";

let socket;

export default function Home() {
  const [screen, setScreen] = useState("menu"); // menu, lobby, game
  const [playerName, setPlayerName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [game, setGame] = useState(null);
  const [error, setError] = useState("");
  const [colorPicker, setColorPicker] = useState(null); // carte en attente de couleur
  const [unoSaid, setUnoSaid] = useState(false);

  useEffect(() => {
    socket = io();

    socket.on("gameCreated", ({ roomId, game }) => {
      setRoomId(roomId);
      setGame(game);
      setScreen("lobby");
    });

    socket.on("gameUpdated", (game) => {
      setGame(game);
    });

    socket.on("gameStarted", (game) => {
      setGame(game);
      setScreen("game");
    });

    socket.on("playerLeft", ({ playerName, game }) => {
      setGame(game);
      setError(`${playerName} a quitté la partie`);
      setTimeout(() => setError(""), 3000);
    });

    socket.on("playerSaidUno", ({ playerName }) => {
      setError(`🎴 ${playerName} a dit UNO!`);
      setTimeout(() => setError(""), 2000);
    });

    socket.on("error", ({ message }) => {
      setError(message);
      setTimeout(() => setError(""), 3000);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const createGame = () => {
    if (!playerName.trim()) {
      setError("Entre ton pseudo!");
      return;
    }
    socket.emit("createGame", { playerName: playerName.trim() });
  };

  const joinGame = () => {
    if (!playerName.trim()) {
      setError("Entre ton pseudo!");
      return;
    }
    if (!roomId.trim()) {
      setError("Entre le code de la partie!");
      return;
    }
    socket.emit("joinGame", { roomId: roomId.trim(), playerName: playerName.trim() });
    setScreen("lobby");
  };

  const startGame = () => {
    socket.emit("startGame", { roomId });
  };

  const playCard = (card) => {
    // Si c'est une carte wild, ouvrir le color picker
    if (card.color === "wild") {
      setColorPicker(card);
      return;
    }
    socket.emit("playCard", { roomId, cardId: card.id });
  };

  const selectColor = (color) => {
    if (colorPicker) {
      socket.emit("playCard", { roomId, cardId: colorPicker.id, chosenColor: color });
      setColorPicker(null);
    }
  };

  const drawCard = () => {
    socket.emit("drawCard", { roomId });
  };

  const sayUno = () => {
    socket.emit("sayUno", { roomId });
    setUnoSaid(true);
    setTimeout(() => setUnoSaid(false), 2000);
  };

  const canPlayCard = (card) => {
    if (!game || !game.topCard) return false;
    if (card.color === "wild") return true;
    if (game.chosenColor && card.color === game.chosenColor) return true;
    return card.color === game.topCard.color || card.value === game.topCard.value;
  };

  const getColorClass = (color) => {
    const colors = {
      rouge: styles.red,
      bleu: styles.blue,
      vert: styles.green,
      jaune: styles.yellow,
      wild: styles.wild
    };
    return colors[color] || "";
  };

  // Écran Menu
  if (screen === "menu") {
    return (
      <div className={styles.container}>
        <div className={styles.menuCard}>
          <h1 className={styles.title}>
            <span className={styles.u}>U</span>
            <span className={styles.n}>N</span>
            <span className={styles.o}>O</span>
          </h1>
          <p className={styles.subtitle}>Multijoueur en ligne</p>
          
          <input
            type="text"
            placeholder="Ton pseudo"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className={styles.input}
            maxLength={15}
          />
          
          <button onClick={createGame} className={styles.btnPrimary}>
            Créer une partie
          </button>
          
          <div className={styles.divider}>ou</div>
          
          <input
            type="text"
            placeholder="Code de la partie"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
            className={styles.input}
            maxLength={6}
          />
          
          <button onClick={joinGame} className={styles.btnSecondary}>
            Rejoindre
          </button>
          
          {error && <div className={styles.error}>{error}</div>}
        </div>
        
        <div className={styles.floatingCards}>
          <div className={styles.floatingCard} style={{ animationDelay: "0s" }}>🔴</div>
          <div className={styles.floatingCard} style={{ animationDelay: "0.5s" }}>🔵</div>
          <div className={styles.floatingCard} style={{ animationDelay: "1s" }}>🟢</div>
          <div className={styles.floatingCard} style={{ animationDelay: "1.5s" }}>🟡</div>
        </div>
      </div>
    );
  }

  // Écran Lobby
  if (screen === "lobby") {
    const isHost = game?.players?.find(p => p.id === socket.id)?.isHost;
    
    return (
      <div className={styles.container}>
        <div className={styles.lobbyCard}>
          <h2 className={styles.lobbyTitle}>Salon d'attente</h2>
          
          <div className={styles.roomCode}>
            <span>Code:</span>
            <strong>{roomId}</strong>
            <button 
              onClick={() => navigator.clipboard.writeText(roomId)}
              className={styles.copyBtn}
            >
              📋
            </button>
          </div>
          
          <div className={styles.playersList}>
            <h3>Joueurs ({game?.players?.length || 0}/4)</h3>
            {game?.players?.map((player, index) => (
              <div key={player.id} className={styles.playerItem}>
                <span className={styles.playerAvatar}>
                  {["🎮", "🎲", "🃏", "🎯"][index]}
                </span>
                <span>{player.name}</span>
                {player.isHost && <span className={styles.hostBadge}>👑</span>}
              </div>
            ))}
          </div>
          
          {isHost ? (
            <button 
              onClick={startGame} 
              className={styles.btnPrimary}
              disabled={game?.players?.length < 2}
            >
              {game?.players?.length < 2 ? "En attente de joueurs..." : "Lancer la partie!"}
            </button>
          ) : (
            <p className={styles.waiting}>En attente du lancement...</p>
          )}
          
          {error && <div className={styles.error}>{error}</div>}
        </div>
      </div>
    );
  }

  // Écran de jeu
  if (screen === "game" && game) {
    const myPlayer = game.players.find(p => p.id === socket.id);
    const opponents = game.players.filter(p => p.id !== socket.id);

    return (
      <div className={styles.gameContainer}>
        {/* Affichage des adversaires */}
        <div className={styles.opponents}>
          {opponents.map((player, index) => (
            <div 
              key={player.id} 
              className={`${styles.opponent} ${player.isCurrentPlayer ? styles.currentPlayer : ""}`}
            >
              <div className={styles.opponentInfo}>
                <span className={styles.opponentName}>{player.name}</span>
                <span className={styles.cardCount}>{player.cardCount} 🃏</span>
              </div>
              <div className={styles.opponentCards}>
                {[...Array(Math.min(player.cardCount, 7))].map((_, i) => (
                  <div key={i} className={styles.cardBack} style={{ marginLeft: i > 0 ? "-30px" : "0" }} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Zone centrale */}
        <div className={styles.centerZone}>
          {/* Pioche */}
          <div className={styles.drawPile} onClick={game.isMyTurn ? drawCard : undefined}>
            <div className={styles.cardBack}>
              <span>PIOCHE</span>
            </div>
            <span className={styles.deckCount}>{game.deckCount}</span>
          </div>

          {/* Carte du dessus */}
          <div className={styles.discardPile}>
            {game.topCard && (
              <img 
                src={game.topCard.image} 
                alt="Top card" 
                className={styles.topCard}
              />
            )}
            {game.chosenColor && (
              <div className={`${styles.chosenColor} ${getColorClass(game.chosenColor)}`}>
                Couleur: {game.chosenColor}
              </div>
            )}
          </div>
        </div>

        {/* Indicateur de tour */}
        <div className={styles.turnIndicator}>
          {game.winner ? (
            <div className={styles.winner}>🎉 {game.winner} a gagné! 🎉</div>
          ) : game.isMyTurn ? (
            <div className={styles.yourTurn}>C'est ton tour!</div>
          ) : (
            <div className={styles.waitingTurn}>
              Tour de {game.players.find(p => p.isCurrentPlayer)?.name}
            </div>
          )}
        </div>

        {/* Bouton UNO */}
        {myPlayer && game.myCards.length === 2 && game.isMyTurn && (
          <button 
            onClick={sayUno} 
            className={`${styles.unoButton} ${unoSaid ? styles.unoSaid : ""}`}
          >
            UNO!
          </button>
        )}

        {/* Main du joueur */}
        <div className={styles.playerHand}>
          <div className={styles.handCards}>
            {game.myCards.map((card, index) => {
              const playable = game.isMyTurn && canPlayCard(card);
              return (
                <div
                  key={card.id}
                  className={`${styles.handCard} ${playable ? styles.playable : styles.unplayable}`}
                  onClick={playable ? () => playCard(card) : undefined}
                  style={{ 
                    animationDelay: `${index * 0.05}s`,
                    zIndex: index
                  }}
                >
                  <img src={card.image} alt={`${card.color} ${card.value}`} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Color picker modal */}
        {colorPicker && (
          <div className={styles.colorPickerOverlay}>
            <div className={styles.colorPicker}>
              <h3>Choisis une couleur</h3>
              <div className={styles.colorOptions}>
                <button 
                  className={`${styles.colorBtn} ${styles.red}`}
                  onClick={() => selectColor("rouge")}
                >Rouge</button>
                <button 
                  className={`${styles.colorBtn} ${styles.blue}`}
                  onClick={() => selectColor("bleu")}
                >Bleu</button>
                <button 
                  className={`${styles.colorBtn} ${styles.green}`}
                  onClick={() => selectColor("vert")}
                >Vert</button>
                <button 
                  className={`${styles.colorBtn} ${styles.yellow}`}
                  onClick={() => selectColor("jaune")}
                >Jaune</button>
              </div>
            </div>
          </div>
        )}

        {/* Messages d'erreur */}
        {error && <div className={styles.gameError}>{error}</div>}
      </div>
    );
  }

  return null;
}
