export class User {
    user_uuid: string = "_INVALID_UUID_";
    username: string = "";
    is_global_admin: boolean = false;
    location: string = "";
    game_uuids: Set<string> = new Set();
    is_me: boolean = false;

    profile_picture: File | null = null;
}