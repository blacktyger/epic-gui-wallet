/*
 * A value for a line the GUI writes into epic-wallet.toml or epic-server.toml, as a TOML basic string.
 *
 * TOML basic strings use the JSON escapes (\\ \" \n \t \uXXXX ...), so JSON.stringify gives a valid
 * one for any path: backslashes on every platform (a Linux folder may contain one too), quotes and
 * control characters. Use it with a function as the replacement, `toml.replace(re, () => line)`, so
 * `$&`, `$1` or `$'` in a folder name are not taken as replacement patterns.
 */
export function tomlString(value){
  return JSON.stringify(String(value));
}
