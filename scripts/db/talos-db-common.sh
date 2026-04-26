#!/usr/bin/env bash

talos_db_script_dir() {
  cd "$(dirname "${BASH_SOURCE[0]}")" && pwd
}

talos_repo_dir() {
  local script_dir
  script_dir="$(talos_db_script_dir)"
  cd "$script_dir/../.." && pwd
}

talos_app_dir() {
  local repo_dir
  repo_dir="$(talos_repo_dir)"
  printf '%s\n' "$repo_dir/apps/talos"
}

load_talos_env_if_needed() {
  if [[ -n "${TALOS_ADMIN_DATABASE_URL:-}" || -n "${DATABASE_URL:-}" || -n "${DATABASE_URL_US:-}" || -n "${DATABASE_URL_UK:-}" ]]; then
    return 0
  fi

  local repo_dir
  repo_dir="$(talos_repo_dir)"
  local mode="local"
  if [[ -n "${TALOS_ENV_MODE:-}" ]]; then
    mode="$TALOS_ENV_MODE"
  fi

  local exports
  if ! exports="$(node "$repo_dir/scripts/load-app-env.js" --app talos --mode "$mode")"; then
    return 1
  fi

  eval "$exports"

  if [[ -n "${TALOS_ADMIN_DATABASE_URL:-}" || -n "${DATABASE_URL:-}" || -n "${DATABASE_URL_US:-}" || -n "${DATABASE_URL_UK:-}" ]]; then
    return 0
  fi

  return 1
}

resolve_talos_database_url() {
  local raw_url=""
  if [[ -n "${TALOS_ADMIN_DATABASE_URL:-}" ]]; then
    raw_url="$TALOS_ADMIN_DATABASE_URL"
  elif [[ -n "${DATABASE_URL_US:-}" ]]; then
    raw_url="$DATABASE_URL_US"
  elif [[ -n "${DATABASE_URL_UK:-}" ]]; then
    raw_url="$DATABASE_URL_UK"
  elif [[ -n "${DATABASE_URL:-}" ]]; then
    raw_url="$DATABASE_URL"
  else
    return 1
  fi

  if [[ "$raw_url" != *"?"* ]]; then
    printf '%s\n' "$raw_url"
    return 0
  fi

  local prefix="${raw_url%%\?*}"
  local query_and_fragment="${raw_url#*\?}"
  local query="$query_and_fragment"
  local fragment=""

  if [[ "$query_and_fragment" == *"#"* ]]; then
    query="${query_and_fragment%%#*}"
    fragment="#${query_and_fragment#*#}"
  fi

  local filtered_query=""
  local pair
  local key
  local -a pairs=()
  IFS='&' read -r -a pairs <<< "$query"
  for pair in "${pairs[@]}"; do
    if [[ -z "$pair" ]]; then
      continue
    fi
    key="${pair%%=*}"
    case "$key" in
      schema|connection_limit|pool_timeout|pgbouncer) continue ;;
    esac

    if [[ -n "$filtered_query" ]]; then
      filtered_query="${filtered_query}&${pair}"
    else
      filtered_query="$pair"
    fi
  done

  if [[ -n "$filtered_query" ]]; then
    printf '%s?%s%s\n' "$prefix" "$filtered_query" "$fragment"
  else
    printf '%s%s\n' "$prefix" "$fragment"
  fi
}
