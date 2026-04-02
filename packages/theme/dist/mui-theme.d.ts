import { type PaletteMode } from '@mui/material/styles';
export type TargonThemeVariant = 'suite' | 'argus';
type CreateThemeArgs = {
    mode: PaletteMode;
    variant?: TargonThemeVariant;
};
export declare function createTargonMuiTheme({ mode, variant, }: CreateThemeArgs): import("@mui/material/styles").Theme;
export declare const suiteLightTheme: import("@mui/material/styles").Theme;
export declare const suiteDarkTheme: import("@mui/material/styles").Theme;
export declare const argusLightTheme: import("@mui/material/styles").Theme;
export declare const argusDarkTheme: import("@mui/material/styles").Theme;
export {};
