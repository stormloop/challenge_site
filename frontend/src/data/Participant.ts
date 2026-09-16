import { User } from "./User";

export class Participant {
    user: User = new User();
    has_admin_permissions: boolean = false;
    challenge_instance_uuids: Set<string> = new Set();

    public getUser() : User { return this.user; }
    public getHasAdminPermissions() : boolean { return this.has_admin_permissions; }
    public getChallengeInstanceUuids() : Set<string> { return this.challenge_instance_uuids; }
}

export default Participant;