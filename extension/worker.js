// Web Worker for Wordle solver computation
// Runs off the main thread to avoid blocking the NYT page

importScripts('words.js', 'solver.js');

const { validWords, possibleWords, firstSuggestionList } = self.wordData;
const { entropyArray, buildPossibleColourMaps, createColourMap, filterRemainingWords, makeSuggestionList } = self.solver;

const possibleColourMaps = buildPossibleColourMaps();

// Derive grey letters from game state
// Only marks a letter grey if ALL its occurrences in a guess got absent feedback
function deriveGreyLetters(guesses, feedbacks) {
  const grey = new Set();
  guesses.forEach((guess, i) => {
    const letterStates = {};
    for (let j = 0; j < 5; j++) {
      const letter = guess[j];
      if (!letterStates[letter]) letterStates[letter] = [];
      letterStates[letter].push(feedbacks[i][j]);
    }
    for (const [letter, states] of Object.entries(letterStates)) {
      if (states.every(s => s === 0)) {
        grey.add(letter);
      }
    }
  });
  return [...grey];
}

// Compute letter frequency analysis across remaining words
function computeLetterFrequency(remainingWords) {
  const freq = {};
  remainingWords.forEach(word => {
    const seen = new Set();
    for (const letter of word) {
      if (!seen.has(letter)) {
        freq[letter] = (freq[letter] || 0) + 1;
        seen.add(letter);
      }
    }
  });
  const total = remainingWords.length;
  return Object.entries(freq)
    .map(([letter, count]) => [letter, Math.round((count / total) * 100)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
}

self.onmessage = function(e) {
  const { guesses, feedbacks } = e.data;

  if (guesses.length === 0) {
    const letterFreq = computeLetterFrequency(possibleWords);
    self.postMessage({
      suggestions: firstSuggestionList.slice(0, 5),
      remaining: possibleWords.length,
      solved: false,
      letterFrequency: letterFreq
    });
    return;
  }

  if (feedbacks[feedbacks.length - 1].every(f => f === 2)) {
    self.postMessage({
      suggestions: [],
      remaining: 1,
      solved: true,
      letterFrequency: []
    });
    return;
  }

  let remainingWords = [...possibleWords];
  for (let i = 0; i < guesses.length; i++) {
    remainingWords = filterRemainingWords(guesses[i], feedbacks[i], remainingWords);
  }

  const greyLetters = deriveGreyLetters(guesses, feedbacks);
  const suggestions = makeSuggestionList(remainingWords, greyLetters, possibleWords, possibleColourMaps);
  const letterFreq = computeLetterFrequency(remainingWords);

  self.postMessage({
    suggestions: suggestions.slice(0, 5),
    remaining: remainingWords.length,
    solved: false,
    letterFrequency: letterFreq
  });
};
