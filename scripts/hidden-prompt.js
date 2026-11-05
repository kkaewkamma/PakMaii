export function createHiddenInputCollector({ maxLength = 8192 } = {}) {
  let value = '';
  let complete = false;

  return {
    push(chunk) {
      if (complete) throw new Error('Hidden input is already complete');
      for (const character of String(chunk)) {
        if (character === '\u0003') {
          complete = true;
          value = '';
          return { done: true, cancelled: true };
        }
        if (character === '\r' || character === '\n') {
          complete = true;
          const sanitized = value.replaceAll('\u001b[200~', '').replaceAll('\u001b[201~', '');
          value = '';
          return { done: true, cancelled: false, value: sanitized };
        }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else value += character;
        if (value.length > maxLength) {
          complete = true;
          value = '';
          return { done: true, cancelled: true, tooLong: true };
        }
      }
      return { done: false };
    },
  };
}

export function describeHiddenInput(value) {
  return {
    length: value.length,
    colonCount: [...value].filter(character => character === ':').length,
    controlCharacterCount: [...value].filter(character => {
      const code = character.codePointAt(0);
      return code < 0x20 || code === 0x7f;
    }).length,
  };
}

export function readHiddenInput({ input = process.stdin, output = process.stdout, prompt = '' } = {}) {
  return new Promise((resolve, reject) => {
    output.write(prompt);
    input.resume();
    const canSetRawMode = typeof input.setRawMode === 'function';
    if (canSetRawMode) input.setRawMode(true);
    const collector = createHiddenInputCollector();
    const finish = (error, value = '') => {
      if (canSetRawMode) input.setRawMode(false);
      input.off('data', onData);
      input.pause();
      output.write('\n');
      error ? reject(error) : resolve(value);
    };
    const onData = chunk => {
      const result = collector.push(chunk);
      if (!result.done) return;
      if (result.tooLong) finish(new Error('Hidden input rejected: TOO_LONG'));
      else if (result.cancelled) finish(new Error('Cancelled'));
      else finish(null, result.value);
    };
    input.on('data', onData);
  });
}
