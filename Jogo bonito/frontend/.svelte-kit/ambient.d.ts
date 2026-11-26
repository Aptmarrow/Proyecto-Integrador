
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/private';
 * 
 * console.log(ENVIRONMENT); // => "production"
 * console.log(PUBLIC_BASE_URL); // => throws error during build
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/private' {
	export const SHELL: string;
	export const npm_command: string;
	export const __EGL_VENDOR_LIBRARY_DIRS: string;
	export const npm_config_userconfig: string;
	export const COLORTERM: string;
	export const VSCODE_DEBUGPY_ADAPTER_ENDPOINTS: string;
	export const npm_config_cache: string;
	export const XDG_SESSION_PATH: string;
	export const NVM_INC: string;
	export const TERM_PROGRAM_VERSION: string;
	export const WLR_NO_HARDWARE_CURSORS: string;
	export const COPILOT_DEBUG_NONCE: string;
	export const CONDA_EXE: string;
	export const _CE_M: string;
	export const QML_XHR_ALLOW_FILE_READ: string;
	export const NODE: string;
	export const VSSCRIPT_PATH: string;
	export const MEMORY_PRESSURE_WRITE: string;
	export const PYDEVD_DISABLE_FILE_VALIDATION: string;
	export const COLOR: string;
	export const npm_config_local_prefix: string;
	export const LIBVA_DRIVER_NAME: string;
	export const DESKTOP_SESSION: string;
	export const KITTY_PID: string;
	export const NO_AT_BRIDGE: string;
	export const npm_config_globalconfig: string;
	export const XCURSOR_SIZE: string;
	export const EDITOR: string;
	export const XDG_SEAT: string;
	export const PWD: string;
	export const GSETTINGS_SCHEMA_DIR: string;
	export const LOGNAME: string;
	export const XDG_SESSION_DESKTOP: string;
	export const XDG_SESSION_TYPE: string;
	export const CONDA_PREFIX: string;
	export const npm_config_init_module: string;
	export const SYSTEMD_EXEC_PID: string;
	export const GSETTINGS_SCHEMA_DIR_CONDA_BACKUP: string;
	export const _: string;
	export const BUNDLED_DEBUGPY_PATH: string;
	export const KITTY_PUBLIC_KEY: string;
	export const VSCODE_GIT_ASKPASS_NODE: string;
	export const MOTD_SHOWN: string;
	export const HOME: string;
	export const LANG: string;
	export const XDG_CURRENT_DESKTOP: string;
	export const npm_package_version: string;
	export const MEMORY_PRESSURE_WATCH: string;
	export const PYTHONSTARTUP: string;
	export const WAYLAND_DISPLAY: string;
	export const KITTY_WINDOW_ID: string;
	export const CONDA_PROMPT_MODIFIER: string;
	export const GIT_ASKPASS: string;
	export const XDG_SEAT_PATH: string;
	export const INVOCATION_ID: string;
	export const NIRI_SOCKET: string;
	export const MANAGERPID: string;
	export const INIT_CWD: string;
	export const CHROME_DESKTOP: string;
	export const npm_lifecycle_script: string;
	export const NVM_DIR: string;
	export const VSCODE_GIT_ASKPASS_EXTRA_ARGS: string;
	export const VSCODE_PYTHON_AUTOACTIVATE_GUARD: string;
	export const npm_config_npm_version: string;
	export const _CONDA_EXE: string;
	export const XDG_SESSION_CLASS: string;
	export const _CONDA_ROOT: string;
	export const TERM: string;
	export const TERMINFO: string;
	export const npm_package_name: string;
	export const PYTHON_BASIC_REPL: string;
	export const _CE_CONDA: string;
	export const npm_config_prefix: string;
	export const USER: string;
	export const VSCODE_GIT_IPC_HANDLE: string;
	export const CONDA_SHLVL: string;
	export const DISPLAY: string;
	export const npm_lifecycle_event: string;
	export const SHLVL: string;
	export const NVM_CD_FLAGS: string;
	export const XDG_VTNR: string;
	export const XDG_SESSION_ID: string;
	export const MANAGERPIDFDID: string;
	export const npm_config_user_agent: string;
	export const npm_execpath: string;
	export const CONDA_PYTHON_EXE: string;
	export const FC_FONTATIONS: string;
	export const XDG_RUNTIME_DIR: string;
	export const CONDA_DEFAULT_ENV: string;
	export const DEBUGINFOD_URLS: string;
	export const npm_package_json: string;
	export const VSCODE_GIT_ASKPASS_MAIN: string;
	export const JOURNAL_STREAM: string;
	export const XCURSOR_THEME: string;
	export const XDG_DATA_DIRS: string;
	export const GDK_BACKEND: string;
	export const npm_config_noproxy: string;
	export const PATH: string;
	export const __GLX_VENDOR_LIBRARY_NAME: string;
	export const npm_config_node_gyp: string;
	export const GBM_BACKEND: string;
	export const DBUS_SESSION_BUS_ADDRESS: string;
	export const npm_config_allow_git: string;
	export const npm_config_global_prefix: string;
	export const MAIL: string;
	export const NVM_BIN: string;
	export const KITTY_INSTALLATION_DIR: string;
	export const npm_node_execpath: string;
	export const npm_config_engine_strict: string;
	export const OLDPWD: string;
	export const TERM_PROGRAM: string;
	export const NODE_ENV: string;
}

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/public';
 * 
 * console.log(ENVIRONMENT); // => throws error during build
 * console.log(PUBLIC_BASE_URL); // => "http://site.com"
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * 
 * console.log(env.ENVIRONMENT); // => "production"
 * console.log(env.PUBLIC_BASE_URL); // => undefined
 * ```
 */
declare module '$env/dynamic/private' {
	export const env: {
		SHELL: string;
		npm_command: string;
		__EGL_VENDOR_LIBRARY_DIRS: string;
		npm_config_userconfig: string;
		COLORTERM: string;
		VSCODE_DEBUGPY_ADAPTER_ENDPOINTS: string;
		npm_config_cache: string;
		XDG_SESSION_PATH: string;
		NVM_INC: string;
		TERM_PROGRAM_VERSION: string;
		WLR_NO_HARDWARE_CURSORS: string;
		COPILOT_DEBUG_NONCE: string;
		CONDA_EXE: string;
		_CE_M: string;
		QML_XHR_ALLOW_FILE_READ: string;
		NODE: string;
		VSSCRIPT_PATH: string;
		MEMORY_PRESSURE_WRITE: string;
		PYDEVD_DISABLE_FILE_VALIDATION: string;
		COLOR: string;
		npm_config_local_prefix: string;
		LIBVA_DRIVER_NAME: string;
		DESKTOP_SESSION: string;
		KITTY_PID: string;
		NO_AT_BRIDGE: string;
		npm_config_globalconfig: string;
		XCURSOR_SIZE: string;
		EDITOR: string;
		XDG_SEAT: string;
		PWD: string;
		GSETTINGS_SCHEMA_DIR: string;
		LOGNAME: string;
		XDG_SESSION_DESKTOP: string;
		XDG_SESSION_TYPE: string;
		CONDA_PREFIX: string;
		npm_config_init_module: string;
		SYSTEMD_EXEC_PID: string;
		GSETTINGS_SCHEMA_DIR_CONDA_BACKUP: string;
		_: string;
		BUNDLED_DEBUGPY_PATH: string;
		KITTY_PUBLIC_KEY: string;
		VSCODE_GIT_ASKPASS_NODE: string;
		MOTD_SHOWN: string;
		HOME: string;
		LANG: string;
		XDG_CURRENT_DESKTOP: string;
		npm_package_version: string;
		MEMORY_PRESSURE_WATCH: string;
		PYTHONSTARTUP: string;
		WAYLAND_DISPLAY: string;
		KITTY_WINDOW_ID: string;
		CONDA_PROMPT_MODIFIER: string;
		GIT_ASKPASS: string;
		XDG_SEAT_PATH: string;
		INVOCATION_ID: string;
		NIRI_SOCKET: string;
		MANAGERPID: string;
		INIT_CWD: string;
		CHROME_DESKTOP: string;
		npm_lifecycle_script: string;
		NVM_DIR: string;
		VSCODE_GIT_ASKPASS_EXTRA_ARGS: string;
		VSCODE_PYTHON_AUTOACTIVATE_GUARD: string;
		npm_config_npm_version: string;
		_CONDA_EXE: string;
		XDG_SESSION_CLASS: string;
		_CONDA_ROOT: string;
		TERM: string;
		TERMINFO: string;
		npm_package_name: string;
		PYTHON_BASIC_REPL: string;
		_CE_CONDA: string;
		npm_config_prefix: string;
		USER: string;
		VSCODE_GIT_IPC_HANDLE: string;
		CONDA_SHLVL: string;
		DISPLAY: string;
		npm_lifecycle_event: string;
		SHLVL: string;
		NVM_CD_FLAGS: string;
		XDG_VTNR: string;
		XDG_SESSION_ID: string;
		MANAGERPIDFDID: string;
		npm_config_user_agent: string;
		npm_execpath: string;
		CONDA_PYTHON_EXE: string;
		FC_FONTATIONS: string;
		XDG_RUNTIME_DIR: string;
		CONDA_DEFAULT_ENV: string;
		DEBUGINFOD_URLS: string;
		npm_package_json: string;
		VSCODE_GIT_ASKPASS_MAIN: string;
		JOURNAL_STREAM: string;
		XCURSOR_THEME: string;
		XDG_DATA_DIRS: string;
		GDK_BACKEND: string;
		npm_config_noproxy: string;
		PATH: string;
		__GLX_VENDOR_LIBRARY_NAME: string;
		npm_config_node_gyp: string;
		GBM_BACKEND: string;
		DBUS_SESSION_BUS_ADDRESS: string;
		npm_config_allow_git: string;
		npm_config_global_prefix: string;
		MAIL: string;
		NVM_BIN: string;
		KITTY_INSTALLATION_DIR: string;
		npm_node_execpath: string;
		npm_config_engine_strict: string;
		OLDPWD: string;
		TERM_PROGRAM: string;
		NODE_ENV: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://example.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.ENVIRONMENT); // => undefined, not public
 * console.log(env.PUBLIC_BASE_URL); // => "http://example.com"
 * ```
 * 
 * ```
 * 
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
