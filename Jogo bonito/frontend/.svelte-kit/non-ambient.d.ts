
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;

	export interface AppTypes {
		RouteId(): "/" | "/lobby" | "/play" | "/test";
		RouteParams(): {
			
		};
		LayoutParams(): {
			"/": Record<string, never>;
			"/lobby": Record<string, never>;
			"/play": Record<string, never>;
			"/test": Record<string, never>
		};
		Pathname(): "/" | "/lobby" | "/play" | "/test";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/assets/sounds/gasterfire.wav" | "/assets/sounds/gasterintro.wav" | "/assets/sounds/masterspark_charge.wav" | "/assets/sounds/masterspark_fire.wav" | "/assets/sprites/FirstBoss.png" | "/assets/sprites/LoadingScreen.png" | "/assets/sprites/ad_banner.png" | "/assets/sprites/boss.png" | "/assets/sprites/defence.png" | "/assets/sprites/dps.png" | "/assets/sprites/healer.png" | "/assets/sprites/physicalattack.png" | "/assets/sprites/spatk.png" | "/assets/sprites/specialattack.png" | "/assets/sprites/support.png" | "/assets/sprites/tank.png" | "/assets/stage1/eff01.png" | "/assets/stage1/face03a.png" | "/assets/stage1/face03a_a.png" | "/assets/stage1/face03b.png" | "/assets/stage1/face03b_a.png" | "/assets/stage1/stg1bg.png" | "/assets/stage1/stg1bg_a.png" | "/assets/stage1/stg1enm.png" | "/assets/stage1/stg1enm2.png" | "/assets/stage1/stg1enm2_a.png" | "/assets/stage1/stg1enm_a.png" | "/robots.txt" | string & {};
	}
}