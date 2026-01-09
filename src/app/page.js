"use client";

import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import styles from "./page.module.css";

let socket;

export default function Home() {
  const [screen, setScreen] = useState("menu");
  const [playerName, setPlayerName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [game, setGame] = useState(null);
  const [error, setError] = useState("");
  const [colorPicker, setColorPicker] = useState(null);
  const [unoSaid, setUnoSaid] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [notification, setNotification] = useState(null);
  const chatRef = useRef(null);

  // Vérifier si on arrive avec un code dans l'URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get("room");
    if (inviteCode) {
      setRoomId(inviteCode.toUpperCase());
    }
  }, []);

  useEffect(() => {
    socket = io();

    socket.on("gameCreated", ({ roomId, game }) => {
      setRoomId(roomId);
      setGame(game);
      setScreen("lobby");
    });

    socket.on("gameUpdated", (game) => {
      setGame(game);
      
      // Notification si c'est mon tour
      if (game.isMyTurn && game.started && !game.winner) {
        if (game.pendingDraw > 0) {
          showNotification(`⚠️ Tu dois piocher ${game.pendingDraw} cartes ou stacker!`, "warning");
        } else {
          showNotification("🎯 C'est ton tour!", "turn");
        }
        
        // Vibration sur mobile
        if (navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
      }
    });

    socket.on("gameStarted", (game) => {
      setGame(game);
      setScreen("game");
      showNotification("🎮 La partie commence!", "success");
    });

    socket.on("gameRestarted", (game) => {
      setGame(game);
      setScreen("game");
      showNotification("🔄 Nouvelle partie!", "success");
    });

    socket.on("playerLeft", ({ playerName, game }) => {
      setGame(game);
      showNotification(`${playerName} a quitté la partie`, "info");
    });

    socket.on("playerSaidUno", ({ playerName }) => {
      showNotification(`🎴 ${playerName} a dit UNO!`, "uno");
    });

    socket.on("newMessage", (message) => {
      setGame(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          chat: [...(prev.chat || []), message].slice(-20)
        };
      });
    });

    socket.on("error", ({ message }) => {
      setError(message);
      setTimeout(() => setError(""), 3000);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Auto-scroll du chat
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [game?.chat]);

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

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

  const restartGame = () => {
    socket.emit("restartGame", { roomId });
  };

  const playCard = (card) => {
    if (card.color === "wild" || card.value === "plus2") {
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

  const acceptDraw = () => {
    socket.emit("acceptDraw", { roomId });
  };

  const sayUno = () => {
    socket.emit("sayUno", { roomId });
    setUnoSaid(true);
    setTimeout(() => setUnoSaid(false), 2000);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    socket.emit("sendMessage", { roomId, message: chatMessage.trim() });
    setChatMessage("");
  };

  const getInviteLink = () => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    return `${baseUrl}?room=${roomId}`;
  };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(getInviteLink());
    showNotification("📋 Lien copié!", "success");
  };

  const canPlayCard = (card) => {
    if (!game || !game.topCard) return false;
    
    // Si on doit piocher, on ne peut jouer que des +2 ou +4
    if (game.pendingDraw > 0) {
      return card.value === "plus2" || card.value === "plus4";
    }
    
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
    const isHost = game?.players?.find(p => p.id === socket?.id)?.isHost;
    
    return (
      <div className={styles.container}>
        <div className={styles.lobbyCard}>
          <h2 className={styles.lobbyTitle}>Salon d'attente</h2>
          
          <div className={styles.roomCode}>
            <span>Code:</span>
            <strong>{roomId}</strong>
          </div>
          
          <div className={styles.inviteSection}>
            <button onClick={copyInviteLink} className={styles.inviteBtn}>
              📤 Copier le lien d'invitation
            </button>
          </div>
          
          <div className={styles.playersList}>
            <h3>Joueurs ({game?.players?.length || 0}/8)</h3>
            {game?.players?.map((player, index) => (
              <div key={player.id} className={styles.playerItem}>
                <span className={styles.playerAvatar}>
                  {["🎮", "🎲", "🃏", "🎯", "🎪", "🎨", "🎭", "🎰"][index]}
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
        
        {notification && (
          <div className={`${styles.notification} ${styles[notification.type]}`}>
            {notification.message}
          </div>
        )}
      </div>
    );
  }

  // Écran de jeu
  if (screen === "game" && game) {
    const myPlayer = game.players.find(p => p.id === socket?.id);
    const opponents = game.players.filter(p => p.id !== socket?.id);
    const isHost = myPlayer?.isHost;
    const hasPlayableCard = game.myCards.some(card => canPlayCard(card));

    return (
      <div className={styles.gameContainer}>
        {/* Header avec infos */}
        <div className={styles.gameHeader}>
          <div className={styles.roomInfo}>
            <span className={styles.roomBadge}>{roomId}</span>
          </div>
          <button 
            className={styles.chatToggle} 
            onClick={() => setChatOpen(!chatOpen)}
          >
            💬 {chatOpen ? "Fermer" : "Chat"}
          </button>
        </div>

        {/* Affichage des adversaires */}
        <div className={styles.opponents}>
          {opponents.map((player, index) => (
            <div 
              key={player.id} 
              className={`${styles.opponent} ${player.isCurrentPlayer ? styles.currentPlayer : ""}`}
            >
              <div className={styles.opponentInfo}>
                <span className={styles.opponentAvatar}>
                  {["🎲", "🃏", "🎯", "🎪", "🎨", "🎭", "🎰"][index]}
                </span>
                <span className={styles.opponentName}>{player.name}</span>
                <span className={styles.cardCount}>{player.cardCount}</span>
              </div>
              <div className={styles.opponentCards}>
                {[...Array(Math.min(player.cardCount, 5))].map((_, i) => (
                  <div 
                    key={i} 
                    className={styles.cardBack} 
                    style={{ transform: `translateX(${i * -15}px) rotate(${(i - 2) * 5}deg)` }} 
                  />
                ))}
                {player.cardCount > 5 && (
                  <span className={styles.moreCards}>+{player.cardCount - 5}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Zone centrale */}
        <div className={styles.centerZone}>
          {/* Pioche */}
          <div 
            className={`${styles.drawPile} ${game.isMyTurn && !game.pendingDraw ? styles.canDraw : ""}`}
            onClick={game.isMyTurn && !game.pendingDraw ? drawCard : undefined}
          >
            <div className={styles.deckStack}>
              <div className={styles.cardBack}></div>
              <div className={styles.cardBack}></div>
              <div className={styles.cardBack}>
                <span>UNO</span>
              </div>
            </div>
            <span className={styles.deckCount}>{game.deckCount}</span>
            {game.isMyTurn && !game.pendingDraw && !hasPlayableCard && (
              <div className={styles.drawHint}>Clique pour piocher!</div>
            )}
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
                {game.chosenColor.toUpperCase()}
              </div>
            )}
          </div>

          {/* Indicateur de cartes à piocher */}
          {game.pendingDraw > 0 && (
            <div className={styles.pendingDraw}>
              <span className={styles.pendingCount}>+{game.pendingDraw}</span>
              <span>cartes en attente</span>
            </div>
          )}
        </div>

        {/* Indicateur de tour */}
        <div className={styles.turnIndicator}>
          {game.winner ? (
            <div className={styles.winnerSection}>
              <div className={styles.winner}>🎉 {game.winner} a gagné! 🎉</div>
              {isHost && (
                <button onClick={restartGame} className={styles.btnRestart}>
                  🔄 Rejouer
                </button>
              )}
            </div>
          ) : game.isMyTurn ? (
            <div className={styles.myTurnSection}>
              {game.pendingDraw > 0 ? (
                <div className={styles.mustDrawSection}>
                  <div className={styles.mustDrawText}>
                    ⚠️ Tu dois piocher {game.pendingDraw} cartes
                  </div>
                  {game.canStack ? (
                    <div className={styles.stackChoice}>
                      <span>ou jouer un +2/+4 pour stacker!</span>
                      <button onClick={acceptDraw} className={styles.btnDraw}>
                        Piocher {game.pendingDraw} cartes
                      </button>
                    </div>
                  ) : (
                    <button onClick={acceptDraw} className={styles.btnDraw}>
                      Piocher {game.pendingDraw} cartes
                    </button>
                  )}
                </div>
              ) : (
                <div className={styles.yourTurn}>
                  🎯 C'est ton tour!
                  {!hasPlayableCard && <span className={styles.noCard}> (Pioche une carte)</span>}
                </div>
              )}
            </div>
          ) : (
            <div className={styles.waitingTurn}>
              Tour de <strong>{game.players.find(p => p.isCurrentPlayer)?.name}</strong>
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
          <div className={styles.handInfo}>
            <span>{myPlayer?.name}</span>
            <span>{game.myCards.length} cartes</span>
          </div>
          <div className={styles.handCards}>
            {game.myCards.map((card, index) => {
              const playable = game.isMyTurn && canPlayCard(card);
              return (
                <div
                  key={card.id}
                  className={`${styles.handCard} ${playable ? styles.playable : styles.unplayable}`}
                  onClick={playable ? () => playCard(card) : undefined}
                  style={{ 
                    animationDelay: `${index * 0.03}s`,
                  }}
                >
                  <img src={card.image} alt={`${card.color} ${card.value}`} />
                  {playable && <div className={styles.playableGlow}></div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Chat */}
        {chatOpen && (
          <div className={styles.chatPanel}>
            <div className={styles.chatHeader}>
              <h3>Chat</h3>
              <button onClick={() => setChatOpen(false)}>✕</button>
            </div>
            <div className={styles.chatMessages} ref={chatRef}>
              {game.chat?.map((msg, index) => (
                <div 
                  key={index} 
                  className={`${styles.chatMessage} ${styles[msg.type]}`}
                >
                  {msg.type === "player" && (
                    <strong>{msg.playerName}: </strong>
                  )}
                  {msg.message}
                </div>
              ))}
            </div>
            <form onSubmit={sendMessage} className={styles.chatInput}>
              <input
                type="text"
                placeholder="Ton message..."
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                maxLength={200}
              />
              <button type="submit">➤</button>
            </form>
          </div>
        )}

        {/* Color picker modal */}
        {colorPicker && (
          <div className={styles.colorPickerOverlay}>
            <div className={styles.colorPicker}>
              <h3>Choisis une couleur</h3>
              <div className={styles.colorOptions}>
                <button 
                  className={`${styles.colorBtn} ${styles.red}`}
                  onClick={() => selectColor("rouge")}
                >
                  <span>Rouge</span>
                </button>
                <button 
                  className={`${styles.colorBtn} ${styles.blue}`}
                  onClick={() => selectColor("bleu")}
                >
                  <span>Bleu</span>
                </button>
                <button 
                  className={`${styles.colorBtn} ${styles.green}`}
                  onClick={() => selectColor("vert")}
                >
                  <span>Vert</span>
                </button>
                <button 
                  className={`${styles.colorBtn} ${styles.yellow}`}
                  onClick={() => selectColor("jaune")}
                >
                  <span>Jaune</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notifications */}
        {notification && (
          <div className={`${styles.notification} ${styles[notification.type]}`}>
            {notification.message}
          </div>
        )}

        {/* Messages d'erreur */}
        {error && <div className={styles.gameError}>{error}</div>}
      </div>
    );
  }

  return null;
}
