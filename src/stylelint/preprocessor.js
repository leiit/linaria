/* @flow */

const babel = require('@babel/core');

/* ::
type LintResult = {
  warnings: { line: number, column: number }[],
};
*/

function preprocessor() {
  const cache = {};

  return {
    code(input /* : string */, filename /* : string */) {
      // Check if the file contains `css` or `styled` tag first
      // Otherwise we should skip linting
      if (!/\b(styled(\([^)]+\)|\.[a-z0-9]+)|css)`/.test(input)) {
        return '';
      }

      let metadata;

      try {
        // eslint-disable-next-line prefer-destructuring
        metadata = babel.transformSync(input, {
          filename,
        }).metadata;
      } catch (e) {
        return '';
      }

      if (!metadata.linaria) {
        return '';
      }

      let cssText = '';

      // Construct a CSS-ish file from the unprocessed style rules
      const { rules, replacements } = metadata.linaria;

      Object.keys(rules).forEach(selector => {
        const rule = rules[selector];

        // Append new lines until we get to the start line number
        let line = cssText.split('\n').length;

        while (line < rule.start.line) {
          cssText += '\n';
          line++;
        }

        cssText += `.${rule.displayName} {`;

        // Append blank spaces until we get to the start column number
        const last = cssText.split('\n').pop();

        let column = last ? last.length : 0;

        while (column < rule.start.column) {
          cssText += ' ';
          column++;
        }

        cssText += `${rule.cssText} }`;
      });

      cache[filename] = replacements;

      return cssText;
    },
    result(result /* : LintResult */, filename /* : string */) {
      const replacements = cache[filename];

      if (replacements) {
        replacements.forEach(({ original, length }) => {
          // If the warnings contain stuff that's been replaced,
          // Correct the line and column numbers to what's replaced
          result.warnings.forEach(w => {
            /* eslint-disable no-param-reassign */

            if (w.line === original.start.line) {
              // If the error is on the same line where an interpolation started, we need to adjust the line and column numbers
              // Because a replacement would have increased or decreased the column numbers
              // If it's in the same line where interpolation ended, it would have been adjusted during replacement
              if (w.column > original.start.column + length) {
                // The error is from an item after the replacements
                // So we need to adjust the column
                w.column +=
                  original.end.column - original.start.column + 1 - length;
              } else if (
                w.column >= original.start.column &&
                w.column < original.start.column + length
              ) {
                // The linter will underline the whole word in the editor if column is in inside a word
                // Set the column to the end, so it will underline the word inside the interpolation
                // e.g. in `${colors.primary}`, `primary` will be underlined
                w.column =
                  original.start.line === original.end.line
                    ? original.end.column - 1
                    : original.start.column;
              }
            }
          });
        });
      }

      return result;
    },
  };
}

module.exports = preprocessor;
