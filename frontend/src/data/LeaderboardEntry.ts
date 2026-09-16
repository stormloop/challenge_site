import Participant from "./Participant";


export class LeaderboardEntry {
    participant: Participant = new Participant();
    points: number = 0;
}

export default LeaderboardEntry;