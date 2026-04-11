// Pure solver functions ported from main.js
// All DOM/UI code removed; only entropy-based solver logic retained

function entropyArray(array) {
  array = array.filter(num => num != 0);
  const total = array.reduce((a, b) => a + b, 0);
  array = array.map(num => num / total);
  return array.reduce((total, curr) => {
    return total + ((Math.log2(1 / curr)) * curr);
  }, 0);
}

function buildPossibleColourMaps() {
  const maps = [];
  const array = [0, 0, 0, 0, 0];
  for (let a = 0; a < 3; a++) {
    array[0] = a;
    for (let b = 0; b < 3; b++) {
      array[1] = b;
      for (let c = 0; c < 3; c++) {
        array[2] = c;
        for (let d = 0; d < 3; d++) {
          array[3] = d;
          for (let e = 0; e < 3; e++) {
            array[4] = e;
            maps.push([...array]);
          }
        }
      }
    }
  }
  return maps;
}

function createColourMap(guess, word) {
  const guessArr = guess.split("");
  const wordArr = word.split("");
  return guessArr.map((letter, index) => {
    if (letter === wordArr[index]) return 2;

    let lettersInWord = 0;
    wordArr.forEach(char => char === letter ? lettersInWord += 1 : null);

    for (let i = 0; i < index; i++) {
      if (guessArr[i] === letter) lettersInWord -= 1;
    }

    for (let i = index + 1; i < 5; i++) {
      if (guessArr[i] === letter && wordArr[i] === letter) lettersInWord -= 1;
    }

    if (0 < lettersInWord) return 1;

    return 0;
  });
}

function filterRemainingWords(guess, colourMap, wordList) {
  const colourMapStr = colourMap.join("");
  return wordList.filter(word => {
    return colourMapStr === createColourMap(guess, word).join("");
  });
}

function makeSuggestionList(remainingWordList, greyLetters, possibleWords, possibleColourMaps) {
  const wordsOfSmallerList = remainingWordList.filter(word => possibleWords.includes(word));
  const reducedPossibleWords = possibleWords.filter(possibleWord =>
    !possibleWord.split("").some(letter => greyLetters.includes(letter))
  );

  let candidateWords;
  if (wordsOfSmallerList.length > 20 && reducedPossibleWords.length >= 1) {
    candidateWords = reducedPossibleWords;
  } else {
    candidateWords = possibleWords;
  }

  const suggestionList = candidateWords.map(word => {
    const possiblityFreq = possibleColourMaps.map(possibleColourMap =>
      filterRemainingWords(word, possibleColourMap, wordsOfSmallerList).length
    );
    const expectedEntropy = entropyArray(possiblityFreq);
    return [word, expectedEntropy + (wordsOfSmallerList.includes(word) ? 1 / wordsOfSmallerList.length : 0)];
  }).sort((a, b) => b[1] - a[1]);

  return suggestionList;
}

self.solver = {
  entropyArray,
  buildPossibleColourMaps,
  createColourMap,
  filterRemainingWords,
  makeSuggestionList
};
