# Sourced by the release scripts. Loads a secret from 1Password unless it is already set in the
# environment (that override is for CI or a one-off). Values are never printed.
#
#   load_secret VAR_NAME   -> reads op://Employee/diade-mobile/VAR_NAME into $VAR_NAME and exports it
load_secret() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    local value
    if ! value="$(op read --no-newline "op://Employee/diade-mobile/${name}" 2>/dev/null)" || [ -z "$value" ]; then
      echo "error: ${name} is not set and could not be read from 1Password (Employee/diade-mobile/${name})." >&2
      echo "       Unlock the 1Password app, or export ${name} yourself." >&2
      return 1
    fi
    printf -v "$name" '%s' "$value"
  fi
  export "${name?}"
}
