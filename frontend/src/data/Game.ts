export class Game {
    game_uuid: string = "_INVALID_UUID_";
    name: string = "";
    participant_uuids: Set<string> = new Set();
    supported_challenge_uuids: Set<string> = new Set();
}