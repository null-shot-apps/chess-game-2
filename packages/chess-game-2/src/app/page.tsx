'use client';

import { useState, useCallback } from 'react';

// ============================================================================
// TYPES
// ============================================================================

type Color = 'white' | 'black';
type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

interface Piece {
  color: Color;
  type: PieceType;
}

type Board = (Piece | null)[][];

interface Position {
  row: number;
  col: number;
}

type GameStatus = 'playing' | 'check' | 'checkmate' | 'stalemate';

interface GameState {
  board: Board;
  currentTurn: Color;
  selectedSquare: Position | null;
  legalMoves: Position[];
  lastMove: { from: Position; to: Position } | null;
  gameStatus: GameStatus;
}

// ============================================================================
// PIECE EXPLANATIONS (for UI display)
// ============================================================================

export const PIECE_EXPLANATIONS = {
  king: {
    name: 'King',
    description: 'Moves 1 square in any direction',
    constraints: 'Cannot move into check',
  },
  queen: {
    name: 'Queen',
    description: 'Moves any distance horizontally, vertically, or diagonally',
    constraints: 'Cannot jump over pieces',
  },
  rook: {
    name: 'Rook',
    description: 'Moves any distance horizontally or vertically',
    constraints: 'Cannot jump over pieces',
  },
  bishop: {
    name: 'Bishop',
    description: 'Moves any distance diagonally',
    constraints: 'Cannot jump over pieces',
  },
  knight: {
    name: 'Knight',
    description: 'Moves in L-shape: 2 squares in one direction, 1 in perpendicular',
    constraints: 'Can jump over pieces',
  },
  pawn: {
    name: 'Pawn',
    description: 'Moves forward 1 square, or 2 from starting position',
    constraints: 'Captures diagonally forward only. Promotes to Queen at end.',
  },
};

// ============================================================================
// CHESS ENGINE
// ============================================================================

const PIECE_UNICODE: Record<Color, Record<PieceType, string>> = {
  white: {
    king: '♔',
    queen: '♕',
    rook: '♖',
    bishop: '♗',
    knight: '♘',
    pawn: '♙',
  },
  black: {
    king: '♚',
    queen: '♛',
    rook: '♜',
    bishop: '♝',
    knight: '♞',
    pawn: '♟',
  },
};

function createInitialBoard(): Board {
  const board: Board = Array(8)
    .fill(null)
    .map(() => Array(8).fill(null));

  // Black pieces
  const backRank: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
  for (let col = 0; col < 8; col++) {
    board[0][col] = { color: 'black', type: backRank[col] };
    board[1][col] = { color: 'black', type: 'pawn' };
  }

  // White pieces
  for (let col = 0; col < 8; col++) {
    board[6][col] = { color: 'white', type: 'pawn' };
    board[7][col] = { color: 'white', type: backRank[col] };
  }

  return board;
}

function isValidPosition(pos: Position): boolean {
  return pos.row >= 0 && pos.row < 8 && pos.col >= 0 && pos.col < 8;
}

function cloneBoard(board: Board): Board {
  return board.map(row => row.map(piece => (piece ? { ...piece } : null)));
}

function findKing(board: Board, color: Color): Position | null {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.color === color && piece.type === 'king') {
        return { row, col };
      }
    }
  }
  return null;
}

// Check if a square is attacked by a specific color
function isSquareAttacked(board: Board, square: Position, byColor: Color): boolean {
  const { row, col } = square;

  // Check pawn attacks
  const pawnDir = byColor === 'white' ? -1 : 1;
  const pawnAttackRow = row + pawnDir;
  for (const colOffset of [-1, 1]) {
    const attackCol = col + colOffset;
    if (pawnAttackRow >= 0 && pawnAttackRow < 8 && attackCol >= 0 && attackCol < 8) {
      const piece = board[pawnAttackRow][attackCol];
      if (piece && piece.color === byColor && piece.type === 'pawn') {
        return true;
      }
    }
  }

  // Check knight attacks
  const knightMoves = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ];
  for (const [dr, dc] of knightMoves) {
    const r = row + dr;
    const c = col + dc;
    if (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const piece = board[r][c];
      if (piece && piece.color === byColor && piece.type === 'knight') {
        return true;
      }
    }
  }

  // Check king attacks (adjacent squares)
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const piece = board[r][c];
        if (piece && piece.color === byColor && piece.type === 'king') {
          return true;
        }
      }
    }
  }

  // Check sliding pieces (rook, bishop, queen)
  const directions = [
    { dr: -1, dc: 0, types: ['rook', 'queen'] },  // up
    { dr: 1, dc: 0, types: ['rook', 'queen'] },   // down
    { dr: 0, dc: -1, types: ['rook', 'queen'] },  // left
    { dr: 0, dc: 1, types: ['rook', 'queen'] },   // right
    { dr: -1, dc: -1, types: ['bishop', 'queen'] }, // up-left
    { dr: -1, dc: 1, types: ['bishop', 'queen'] },  // up-right
    { dr: 1, dc: -1, types: ['bishop', 'queen'] },  // down-left
    { dr: 1, dc: 1, types: ['bishop', 'queen'] },   // down-right
  ];

  for (const { dr, dc, types } of directions) {
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const piece = board[r][c];
      if (piece) {
        if (piece.color === byColor && types.includes(piece.type)) {
          return true;
        }
        break; // Blocked by any piece
      }
      r += dr;
      c += dc;
    }
  }

  return false;
}

function isKingInCheck(board: Board, color: Color): boolean {
  const kingPos = findKing(board, color);
  if (!kingPos) return false;
  const opponentColor = color === 'white' ? 'black' : 'white';
  return isSquareAttacked(board, kingPos, opponentColor);
}

// Generate pseudo-legal moves (without check validation)
function generatePseudoLegalMoves(board: Board, from: Position): Position[] {
  const piece = board[from.row][from.col];
  if (!piece) return [];

  const moves: Position[] = [];
  const { row, col } = from;
  const { color, type } = piece;

  if (type === 'pawn') {
    const direction = color === 'white' ? -1 : 1;
    const startRank = color === 'white' ? 6 : 1;

    // Move forward 1
    const forward1 = { row: row + direction, col };
    if (isValidPosition(forward1) && !board[forward1.row][forward1.col]) {
      moves.push(forward1);

      // Move forward 2 from start
      if (row === startRank) {
        const forward2 = { row: row + 2 * direction, col };
        if (!board[forward2.row][forward2.col]) {
          moves.push(forward2);
        }
      }
    }

    // Captures
    for (const colOffset of [-1, 1]) {
      const capturePos = { row: row + direction, col: col + colOffset };
      if (isValidPosition(capturePos)) {
        const target = board[capturePos.row][capturePos.col];
        if (target && target.color !== color) {
          moves.push(capturePos);
        }
      }
    }
  } else if (type === 'knight') {
    const knightMoves = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1],
    ];
    for (const [dr, dc] of knightMoves) {
      const pos = { row: row + dr, col: col + dc };
      if (isValidPosition(pos)) {
        const target = board[pos.row][pos.col];
        if (!target || target.color !== color) {
          moves.push(pos);
        }
      }
    }
  } else if (type === 'king') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const pos = { row: row + dr, col: col + dc };
        if (isValidPosition(pos)) {
          const target = board[pos.row][pos.col];
          if (!target || target.color !== color) {
            moves.push(pos);
          }
        }
      }
    }
  } else {
    // Sliding pieces: rook, bishop, queen
    let directions: Array<[number, number]> = [];
    if (type === 'rook' || type === 'queen') {
      directions.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    }
    if (type === 'bishop' || type === 'queen') {
      directions.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    }

    for (const [dr, dc] of directions) {
      let r = row + dr;
      let c = col + dc;
      while (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const target = board[r][c];
        if (!target) {
          moves.push({ row: r, col: c });
        } else {
          if (target.color !== color) {
            moves.push({ row: r, col: c });
          }
          break;
        }
        r += dr;
        c += dc;
      }
    }
  }

  return moves;
}

// Generate legal moves (filter out moves that leave king in check)
function generateLegalMoves(board: Board, from: Position): Position[] {
  const piece = board[from.row][from.col];
  if (!piece) return [];

  const pseudoMoves = generatePseudoLegalMoves(board, from);
  const legalMoves: Position[] = [];

  for (const move of pseudoMoves) {
    const testBoard = cloneBoard(board);
    testBoard[move.row][move.col] = testBoard[from.row][from.col];
    testBoard[from.row][from.col] = null;

    // Check for pawn promotion
    if (piece.type === 'pawn') {
      const promotionRank = piece.color === 'white' ? 0 : 7;
      if (move.row === promotionRank) {
        testBoard[move.row][move.col] = { color: piece.color, type: 'queen' };
      }
    }

    if (!isKingInCheck(testBoard, piece.color)) {
      legalMoves.push(move);
    }
  }

  return legalMoves;
}

function hasAnyLegalMoves(board: Board, color: Color): boolean {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.color === color) {
        const moves = generateLegalMoves(board, { row, col });
        if (moves.length > 0) return true;
      }
    }
  }
  return false;
}

function evaluateGameStatus(board: Board, currentTurn: Color): GameStatus {
  const inCheck = isKingInCheck(board, currentTurn);
  const hasLegalMoves = hasAnyLegalMoves(board, currentTurn);

  if (!hasLegalMoves) {
    return inCheck ? 'checkmate' : 'stalemate';
  }

  return inCheck ? 'check' : 'playing';
}

// ============================================================================
// REACT COMPONENT
// ============================================================================

export default function ChessGame() {
  const [gameState, setGameState] = useState<GameState>(() => ({
    board: createInitialBoard(),
    currentTurn: 'white',
    selectedSquare: null,
    legalMoves: [],
    lastMove: null,
    gameStatus: 'playing',
  }));

  const handleSquareClick = useCallback((row: number, col: number) => {
    setGameState(prev => {
      const { board, currentTurn, selectedSquare, legalMoves, gameStatus } = prev;

      // Game over - no moves allowed
      if (gameStatus === 'checkmate' || gameStatus === 'stalemate') {
        return prev;
      }

      const clickedPiece = board[row][col];
      const clickedPos = { row, col };

      // No piece selected yet
      if (!selectedSquare) {
        // Click on own piece - select it
        if (clickedPiece && clickedPiece.color === currentTurn) {
          const moves = generateLegalMoves(board, clickedPos);
          return {
            ...prev,
            selectedSquare: clickedPos,
            legalMoves: moves,
          };
        }
        return prev;
      }

      // Piece already selected
      const isLegalMove = legalMoves.some(m => m.row === row && m.col === col);

      if (isLegalMove) {
        // Execute move
        const newBoard = cloneBoard(board);
        const movingPiece = newBoard[selectedSquare.row][selectedSquare.col]!;
        newBoard[row][col] = movingPiece;
        newBoard[selectedSquare.row][selectedSquare.col] = null;

        // Pawn promotion
        if (movingPiece.type === 'pawn') {
          const promotionRank = movingPiece.color === 'white' ? 0 : 7;
          if (row === promotionRank) {
            newBoard[row][col] = { color: movingPiece.color, type: 'queen' };
          }
        }

        const nextTurn = currentTurn === 'white' ? 'black' : 'white';
        const newStatus = evaluateGameStatus(newBoard, nextTurn);

        return {
          board: newBoard,
          currentTurn: nextTurn,
          selectedSquare: null,
          legalMoves: [],
          lastMove: { from: selectedSquare, to: clickedPos },
          gameStatus: newStatus,
        };
      } else {
        // Click on own piece - change selection
        if (clickedPiece && clickedPiece.color === currentTurn) {
          const moves = generateLegalMoves(board, clickedPos);
          return {
            ...prev,
            selectedSquare: clickedPos,
            legalMoves: moves,
          };
        }

        // Click elsewhere - clear selection
        return {
          ...prev,
          selectedSquare: null,
          legalMoves: [],
        };
      }
    });
  }, []);

  const resetGame = useCallback(() => {
    setGameState({
      board: createInitialBoard(),
      currentTurn: 'white',
      selectedSquare: null,
      legalMoves: [],
      lastMove: null,
      gameStatus: 'playing',
    });
  }, []);

  const { board, currentTurn, selectedSquare, legalMoves, lastMove, gameStatus } = gameState;

  return (
    <div className="h-[100dvh] w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-6 max-w-4xl w-full">
        {/* Status Bar */}
        <div className="flex items-center justify-between w-full max-w-[600px] px-4">
          <div className="text-white text-lg font-semibold">
            {gameStatus === 'checkmate' && (
              <span className="text-red-400">
                Checkmate! {currentTurn === 'white' ? 'Black' : 'White'} wins!
              </span>
            )}
            {gameStatus === 'stalemate' && (
              <span className="text-yellow-400">Stalemate! Draw.</span>
            )}
            {gameStatus === 'check' && (
              <span className="text-orange-400">Check!</span>
            )}
            {gameStatus === 'playing' && (
              <span className="capitalize">{currentTurn}'s turn</span>
            )}
          </div>
          <button
            onClick={resetGame}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            New Game
          </button>
        </div>

        {/* Chess Board */}
        <div className="relative">
          <div className="grid grid-cols-8 gap-0 border-4 border-amber-900 shadow-2xl">
            {board.map((row, rowIndex) =>
              row.map((piece, colIndex) => {
                const isLight = (rowIndex + colIndex) % 2 === 0;
                const isSelected =
                  selectedSquare?.row === rowIndex && selectedSquare?.col === colIndex;
                const isLegalMove = legalMoves.some(
                  m => m.row === rowIndex && m.col === colIndex
                );
                const isLastMoveSquare =
                  lastMove &&
                  ((lastMove.from.row === rowIndex && lastMove.from.col === colIndex) ||
                    (lastMove.to.row === rowIndex && lastMove.to.col === colIndex));

                return (
                  <button
                    key={`${rowIndex}-${colIndex}`}
                    onClick={() => handleSquareClick(rowIndex, colIndex)}
                    className={`
                      w-[60px] h-[60px] sm:w-[70px] sm:h-[70px] md:w-[75px] md:h-[75px]
                      flex items-center justify-center text-4xl sm:text-5xl
                      transition-all duration-150 relative
                      ${isLight ? 'bg-amber-100' : 'bg-amber-700'}
                      ${isSelected ? 'ring-4 ring-blue-500 ring-inset' : ''}
                      ${isLastMoveSquare ? 'bg-opacity-70' : ''}
                      hover:brightness-110
                    `}
                  >
                    {piece && PIECE_UNICODE[piece.color][piece.type]}
                    {isLegalMove && (
                      <div
                        className={`absolute inset-0 flex items-center justify-center pointer-events-none`}
                      >
                        <div
                          className={`rounded-full ${
                            piece
                              ? 'w-full h-full border-4 border-green-500 border-opacity-60'
                              : 'w-4 h-4 bg-green-500 bg-opacity-60'
                          }`}
                        />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Captured Pieces Display */}
        <div className="flex gap-8 text-white">
          <div className="flex flex-col items-center gap-2">
            <div className="text-sm opacity-70">Captured by White</div>
            <div className="flex gap-1 flex-wrap max-w-[200px]">
              {board.flat().filter(p => p === null).length > 0 && (
                <div className="text-2xl opacity-50">
                  {/* Placeholder for captured pieces visualization */}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="text-sm opacity-70">Captured by Black</div>
            <div className="flex gap-1 flex-wrap max-w-[200px]">
              {board.flat().filter(p => p === null).length > 0 && (
                <div className="text-2xl opacity-50">
                  {/* Placeholder for captured pieces visualization */}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

