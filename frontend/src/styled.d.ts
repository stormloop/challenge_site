import "styled-components";

declare module "styled-components" {
    export interface DefaultTheme {
        bg_color: string;
        bg_color_lightened: string;
        bg_color_darkened: string;
        text_color: string;

        accent_color_1: string;
        accent_color_2: string;
        accent_color_3: string;
        accent_color_4: string;
        accent_color_5: string;

        leaderboard_color_1: string;
        leaderboard_color_2: string;
        leaderboard_color_3: string;

        text_font_family: string;
    }
}