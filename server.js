const { createServer } = require("http");
const { Server } = require("socket.io");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = process.env.PORT || 3005;

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

// Couleurs et valeurs des cartes UNO
const COLORS = ["rouge", "bleu", "vert", "jaune"];
const VALUES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "plus2"];
const SPECIAL_CARDS = ["change", "plus4"];

// Créer le deck complet
function createDeck() {
  const deck = [];
  
  // Cartes numérotées (2 de chaque par couleur)
  for (const color of COLORS) {
    for (const value of VALUES) {
      deck.push({ color, value, id: `${color}-${value}-1` });
      deck.push({ color, value, id: `${color}-${value}-2` });
    }
  }
  
  // Cartes spéciales (4 de chaque)
  for (let i = 0; i < 4; i++) {
    deck.push({ color: "wild", value: "change", id: `change-${i}` });
    deck.push({ color: "wild", value: "plus4", id: `plus4-${i}` });
  }
  
  return deck;
}

// Mélanger le deck
function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Obtenir le chemin de l'image d'une carte
function getCardImage(card) {
  if (card.value === "change") return "/cartes/change.png";
  if (card.value === "plus4") return "/cartes/plus4.png";
  
  const colorFolder = {
    rouge: "chiffreRouge",
    bleu: "chiffreBleu",
    vert: "chiffreVert",
    jaune: "chiffreJaune"
  };
  
  return `/cartes/${colorFolder[card.color]}/${card.value}.png`;
}

// Vérifier si une carte peut être jouée
function canPlayCard(card, topCard, chosenColor, pendingDraw) {
  // Si on a des cartes à piocher en attente, on ne peut jouer que des +2 ou +4
  if (pendingDraw > 0) {
    return card.value === "plus2" || card.value === "plus4";
  }
  
  // Les cartes wild peuvent toujours être jouées
  if (card.color === "wild") return true;
  
  // Si une couleur a été choisie (après un wild)
  if (chosenColor && card.color === chosenColor) return true;
  
  // Même couleur ou même valeur
  return card.color === topCard.color || card.value === topCard.value;
}

// État des parties
const games = new Map();

// Créer une nouvelle partie
function createGame(roomId, hostId, hostName) {
  return {
    roomId,
    players: [{ id: hostId, name: hostName, cards: [], isHost: true }],
    deck: [],
    discardPile: [],
    currentPlayerIndex: 0,
    direction: 1,
    chosenColor: null,
    started: false,
    winner: null,
    pendingDraw: 0, // Cartes +2/+4 accumulées
    mustDraw: false, // Le joueur doit piocher ou stacker
    chat: [], // Historique du chat
  };
}

// Distribuer les cartes
function dealCards(game) {
  game.deck = shuffleDeck(createDeck());
  
  // Distribuer 7 cartes à chaque joueur
  for (const player of game.players) {
    player.cards = game.deck.splice(0, 7).map(card => ({
      ...card,
      image: getCardImage(card)
    }));
  }
  
  // Retourner la première carte (pas un wild ni +2/+4)
  let firstCard;
  do {
    firstCard = game.deck.shift();
    if (firstCard.color === "wild" || firstCard.value === "plus2") {
      game.deck.push(firstCard);
    }
  } while (firstCard.color === "wild" || firstCard.value === "plus2");
  
  firstCard.image = getCardImage(firstCard);
  game.discardPile.push(firstCard);
}

// Réinitialiser la partie pour rejouer
function resetGame(game) {
  game.deck = [];
  game.discardPile = [];
  game.currentPlayerIndex = 0;
  game.direction = 1;
  game.chosenColor = null;
  game.started = false;
  game.winner = null;
  game.pendingDraw = 0;
  game.mustDraw = false;
  
  for (const player of game.players) {
    player.cards = [];
  }
}

// Piocher une carte
function drawCard(game, playerId) {
  const player = game.players.find(p => p.id === playerId);
  if (!player) return null;
  
  // Si le deck est vide, recycler la pile de défausse
  if (game.deck.length === 0) {
    const topCard = game.discardPile.pop();
    game.deck = shuffleDeck(game.discardPile);
    game.discardPile = [topCard];
  }
  
  const card = game.deck.shift();
  if (card) {
    card.image = getCardImage(card);
    player.cards.push(card);
  }
  
  return card;
}

// Passer au joueur suivant
function nextPlayer(game) {
  game.currentPlayerIndex = (game.currentPlayerIndex + game.direction + game.players.length) % game.players.length;
}

// Vérifier si le joueur peut stacker (a un +2 ou +4)
function canStack(player) {
  return player.cards.some(card => card.value === "plus2" || card.value === "plus4");
}

app.prepare().then(() => {
  const httpServer = createServer(handler);
  const io = new Server(httpServer);

  io.on("connection", (socket) => {
    console.log("Joueur connecté:", socket.id);

    // Créer une partie
    socket.on("createGame", ({ playerName }) => {
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const game = createGame(roomId, socket.id, playerName);
      games.set(roomId, game);
      socket.join(roomId);
      
      socket.emit("gameCreated", { roomId, game: sanitizeGameForPlayer(game, socket.id) });
      console.log(`Partie créée: ${roomId} par ${playerName}`);
    });

    // Rejoindre une partie
    socket.on("joinGame", ({ roomId, playerName }) => {
      const normalizedRoomId = roomId.toUpperCase();
      const game = games.get(normalizedRoomId);
      
      if (!game) {
        socket.emit("error", { message: "Partie introuvable" });
        return;
      }
      
      if (game.started) {
        socket.emit("error", { message: "La partie a déjà commencé" });
        return;
      }
      
      if (game.players.length >= 8) {
        socket.emit("error", { message: "La partie est pleine (max 8 joueurs)" });
        return;
      }
      
      // Vérifier si le pseudo est déjà pris
      if (game.players.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
        socket.emit("error", { message: "Ce pseudo est déjà pris" });
        return;
      }
      
      game.players.push({ id: socket.id, name: playerName, cards: [], isHost: false });
      socket.join(normalizedRoomId);
      
      // Message système dans le chat
      game.chat.push({
        type: "system",
        message: `${playerName} a rejoint la partie`,
        timestamp: Date.now()
      });
      
      // Notifier tous les joueurs
      for (const player of game.players) {
        io.to(player.id).emit("gameUpdated", sanitizeGameForPlayer(game, player.id));
      }
      
      console.log(`${playerName} a rejoint la partie ${normalizedRoomId}`);
    });

    // Démarrer la partie
    socket.on("startGame", ({ roomId }) => {
      const game = games.get(roomId);
      
      if (!game) return;
      
      const player = game.players.find(p => p.id === socket.id);
      if (!player?.isHost) {
        socket.emit("error", { message: "Seul l'hôte peut démarrer la partie" });
        return;
      }
      
      if (game.players.length < 2) {
        socket.emit("error", { message: "Il faut au moins 2 joueurs" });
        return;
      }
      
      dealCards(game);
      game.started = true;
      
      game.chat.push({
        type: "system",
        message: "La partie commence !",
        timestamp: Date.now()
      });
      
      // Envoyer l'état à chaque joueur
      for (const p of game.players) {
        io.to(p.id).emit("gameStarted", sanitizeGameForPlayer(game, p.id));
      }
      
      console.log(`Partie ${roomId} démarrée!`);
    });

    // Rejouer une partie
    socket.on("restartGame", ({ roomId }) => {
      const game = games.get(roomId);
      
      if (!game) return;
      
      const player = game.players.find(p => p.id === socket.id);
      if (!player?.isHost) {
        socket.emit("error", { message: "Seul l'hôte peut relancer la partie" });
        return;
      }
      
      resetGame(game);
      dealCards(game);
      game.started = true;
      
      game.chat.push({
        type: "system",
        message: "Nouvelle partie !",
        timestamp: Date.now()
      });
      
      for (const p of game.players) {
        io.to(p.id).emit("gameRestarted", sanitizeGameForPlayer(game, p.id));
      }
    });

    // Jouer une carte
    socket.on("playCard", ({ roomId, cardId, chosenColor }) => {
      const game = games.get(roomId);
      if (!game || !game.started || game.winner) return;
      
      const playerIndex = game.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1 || playerIndex !== game.currentPlayerIndex) {
        socket.emit("error", { message: "Ce n'est pas ton tour!" });
        return;
      }
      
      const player = game.players[playerIndex];
      const cardIndex = player.cards.findIndex(c => c.id === cardId);
      if (cardIndex === -1) return;
      
      const card = player.cards[cardIndex];
      const topCard = game.discardPile[game.discardPile.length - 1];
      
      if (!canPlayCard(card, topCard, game.chosenColor, game.pendingDraw)) {
        socket.emit("error", { message: "Tu ne peux pas jouer cette carte!" });
        return;
      }
      
      // Retirer la carte de la main du joueur
      player.cards.splice(cardIndex, 1);
      game.discardPile.push(card);
      
      // Réinitialiser la couleur choisie
      game.chosenColor = null;
      game.mustDraw = false;
      
      // Gérer les effets des cartes spéciales
      if (card.value === "plus2") {
        game.pendingDraw += 2;
        if (chosenColor) game.chosenColor = chosenColor;
        nextPlayer(game);
        
        // Vérifier si le prochain joueur peut stacker
        const nextPlayerObj = game.players[game.currentPlayerIndex];
        if (canStack(nextPlayerObj)) {
          game.mustDraw = true; // Il doit choisir: stacker ou piocher
        } else {
          // Il doit piocher
          for (let i = 0; i < game.pendingDraw; i++) {
            drawCard(game, nextPlayerObj.id);
          }
          game.pendingDraw = 0;
          nextPlayer(game);
        }
      } else if (card.value === "plus4") {
        game.pendingDraw += 4;
        if (chosenColor) game.chosenColor = chosenColor;
        nextPlayer(game);
        
        const nextPlayerObj = game.players[game.currentPlayerIndex];
        if (canStack(nextPlayerObj)) {
          game.mustDraw = true;
        } else {
          for (let i = 0; i < game.pendingDraw; i++) {
            drawCard(game, nextPlayerObj.id);
          }
          game.pendingDraw = 0;
          nextPlayer(game);
        }
      } else if (card.value === "change") {
        if (chosenColor) game.chosenColor = chosenColor;
        nextPlayer(game);
      } else {
        nextPlayer(game);
      }
      
      // Vérifier la victoire
      if (player.cards.length === 0) {
        game.winner = player.name;
        game.chat.push({
          type: "system",
          message: `🎉 ${player.name} a gagné la partie!`,
          timestamp: Date.now()
        });
      }
      
      // Notifier tous les joueurs
      for (const p of game.players) {
        io.to(p.id).emit("gameUpdated", sanitizeGameForPlayer(game, p.id));
      }
    });

    // Piocher les cartes (accepter le stack)
    socket.on("acceptDraw", ({ roomId }) => {
      const game = games.get(roomId);
      if (!game || !game.started || game.winner) return;
      
      const playerIndex = game.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1 || playerIndex !== game.currentPlayerIndex) return;
      
      if (game.pendingDraw > 0) {
        const player = game.players[playerIndex];
        for (let i = 0; i < game.pendingDraw; i++) {
          drawCard(game, player.id);
        }
        game.pendingDraw = 0;
        game.mustDraw = false;
        nextPlayer(game);
        
        for (const p of game.players) {
          io.to(p.id).emit("gameUpdated", sanitizeGameForPlayer(game, p.id));
        }
      }
    });

    // Piocher une carte (tour normal)
    socket.on("drawCard", ({ roomId }) => {
      const game = games.get(roomId);
      if (!game || !game.started || game.winner) return;
      
      const playerIndex = game.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1 || playerIndex !== game.currentPlayerIndex) {
        socket.emit("error", { message: "Ce n'est pas ton tour!" });
        return;
      }
      
      // Si on a des cartes en attente, utiliser acceptDraw
      if (game.pendingDraw > 0) {
        socket.emit("error", { message: "Utilise le bouton piocher pour prendre les cartes +" });
        return;
      }
      
      drawCard(game, socket.id);
      nextPlayer(game);
      
      for (const p of game.players) {
        io.to(p.id).emit("gameUpdated", sanitizeGameForPlayer(game, p.id));
      }
    });

    // Dire UNO
    socket.on("sayUno", ({ roomId }) => {
      const game = games.get(roomId);
      if (!game) return;
      
      const player = game.players.find(p => p.id === socket.id);
      if (player && player.cards.length === 1) {
        game.chat.push({
          type: "uno",
          playerName: player.name,
          message: `${player.name} a dit UNO!`,
          timestamp: Date.now()
        });
        
        io.to(roomId).emit("playerSaidUno", { playerName: player.name });
        
        for (const p of game.players) {
          io.to(p.id).emit("gameUpdated", sanitizeGameForPlayer(game, p.id));
        }
      }
    });

    // Chat
    socket.on("sendMessage", ({ roomId, message }) => {
      const game = games.get(roomId);
      if (!game) return;
      
      const player = game.players.find(p => p.id === socket.id);
      if (!player) return;
      
      const chatMessage = {
        type: "player",
        playerName: player.name,
        message: message.substring(0, 200), // Limite 200 caractères
        timestamp: Date.now()
      };
      
      game.chat.push(chatMessage);
      
      // Garder seulement les 50 derniers messages
      if (game.chat.length > 50) {
        game.chat = game.chat.slice(-50);
      }
      
      io.to(roomId).emit("newMessage", chatMessage);
    });

    // Déconnexion
    socket.on("disconnect", () => {
      console.log("Joueur déconnecté:", socket.id);
      
      for (const [roomId, game] of games.entries()) {
        const playerIndex = game.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          const player = game.players[playerIndex];
          game.players.splice(playerIndex, 1);
          
          game.chat.push({
            type: "system",
            message: `${player.name} a quitté la partie`,
            timestamp: Date.now()
          });
          
          if (game.players.length === 0) {
            games.delete(roomId);
          } else {
            if (player.isHost && game.players.length > 0) {
              game.players[0].isHost = true;
            }
            
            if (game.started && game.currentPlayerIndex >= game.players.length) {
              game.currentPlayerIndex = 0;
            }
            
            for (const p of game.players) {
              io.to(p.id).emit("playerLeft", { 
                playerName: player.name,
                game: sanitizeGameForPlayer(game, p.id)
              });
            }
          }
        }
      }
    });
  });

  function sanitizeGameForPlayer(game, playerId) {
    const currentPlayer = game.players[game.currentPlayerIndex];
    const myPlayer = game.players.find(p => p.id === playerId);
    
    return {
      roomId: game.roomId,
      players: game.players.map(p => ({
        id: p.id,
        name: p.name,
        cardCount: p.cards.length,
        cards: p.id === playerId ? p.cards : [],
        isHost: p.isHost,
        isCurrentPlayer: currentPlayer?.id === p.id
      })),
      topCard: game.discardPile[game.discardPile.length - 1],
      deckCount: game.deck.length,
      currentPlayerId: currentPlayer?.id,
      chosenColor: game.chosenColor,
      started: game.started,
      winner: game.winner,
      myCards: myPlayer?.cards || [],
      isMyTurn: currentPlayer?.id === playerId,
      pendingDraw: game.pendingDraw,
      mustDraw: game.mustDraw,
      canStack: myPlayer ? canStack(myPlayer) : false,
      chat: game.chat.slice(-20), // Derniers 20 messages
    };
  }

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
