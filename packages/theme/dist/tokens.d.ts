export declare const brandColors: {
    readonly primary: "#002C51";
    readonly secondary: "#00C2B9";
    readonly white: "#FFFFFF";
    readonly black: "#04111C";
    readonly navy: {
        readonly 50: "#F1F5F8";
        readonly 100: "#DAE6EF";
        readonly 200: "#B9CBDB";
        readonly 300: "#91AAC1";
        readonly 400: "#6888A7";
        readonly 500: "#456A8A";
        readonly 600: "#2E4F6E";
        readonly 700: "#1D3B57";
        readonly 800: "#0F2D44";
        readonly 900: "#002C51";
        readonly 950: "#01192F";
    };
    readonly teal: {
        readonly 50: "#E8FCFB";
        readonly 100: "#CBF8F5";
        readonly 200: "#97F0EA";
        readonly 300: "#5CE4DD";
        readonly 400: "#20D4CC";
        readonly 500: "#00C2B9";
        readonly 600: "#04A49D";
        readonly 700: "#0B847E";
        readonly 800: "#106864";
        readonly 900: "#125452";
        readonly 950: "#073433";
    };
    readonly gray: {
        readonly 50: "#F7F9FB";
        readonly 100: "#EFF3F6";
        readonly 200: "#DDE5EB";
        readonly 300: "#C5D1DA";
        readonly 400: "#A5B5C1";
        readonly 500: "#8396A6";
        readonly 600: "#65798B";
        readonly 700: "#4F6172";
        readonly 800: "#384655";
        readonly 900: "#212D39";
        readonly 950: "#101820";
    };
};
export type BrandColorToken = keyof typeof brandColors;
export declare const surfaceColors: {
    readonly light: {
        readonly canvas: "#F4F7FA";
        readonly subtle: "#ECF2F7";
        readonly paper: "#FFFFFF";
        readonly raised: "#FAFCFD";
        readonly border: "rgba(0, 44, 81, 0.12)";
        readonly borderStrong: "rgba(0, 44, 81, 0.18)";
    };
    readonly dark: {
        readonly canvas: "#08131D";
        readonly subtle: "#0E1C29";
        readonly paper: "#122230";
        readonly raised: "#172938";
        readonly border: "rgba(255, 255, 255, 0.10)";
        readonly borderStrong: "rgba(255, 255, 255, 0.16)";
    };
};
export declare const brandFontFamilies: {
    readonly heading: "var(--font-sans), Inter, system-ui, sans-serif";
    readonly primary: "var(--font-sans), Inter, system-ui, sans-serif";
    readonly secondary: "var(--font-sans), Inter, system-ui, sans-serif";
    readonly mono: "var(--font-mono), \"JetBrains Mono\", Monaco, Consolas, monospace";
};
export type BrandFontToken = keyof typeof brandFontFamilies;
export declare const brandRadii: {
    readonly sm: 8;
    readonly md: 12;
    readonly lg: 16;
    readonly xl: 24;
};
export type BrandRadiusToken = keyof typeof brandRadii;
export declare const semanticColors: {
    readonly success: {
        readonly 50: "#ECFDF3";
        readonly 100: "#D1FADF";
        readonly 200: "#A6F4C5";
        readonly 300: "#6CE9A6";
        readonly 400: "#32D583";
        readonly 500: "#12B76A";
        readonly 600: "#039855";
        readonly 700: "#027A48";
        readonly 800: "#05603A";
        readonly 900: "#054F31";
    };
    readonly warning: {
        readonly 50: "#FFFAEB";
        readonly 100: "#FEF0C7";
        readonly 200: "#FEDF89";
        readonly 300: "#FEC84B";
        readonly 400: "#FDB022";
        readonly 500: "#F79009";
        readonly 600: "#DC6803";
        readonly 700: "#B54708";
        readonly 800: "#93370D";
        readonly 900: "#7A2E0E";
    };
    readonly danger: {
        readonly 50: "#FEF3F2";
        readonly 100: "#FEE4E2";
        readonly 200: "#FECDCA";
        readonly 300: "#FDA29B";
        readonly 400: "#F97066";
        readonly 500: "#F04438";
        readonly 600: "#D92D20";
        readonly 700: "#B42318";
        readonly 800: "#912018";
        readonly 900: "#7A271A";
    };
};
