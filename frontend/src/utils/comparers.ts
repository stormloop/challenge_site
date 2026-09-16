export function dateComparer(a: string | Date, b: string | Date) : number {
    let a_number, b_number;
    if (typeof a === "string")
        a_number = Date.parse(a);
    else
        a_number = a.valueOf();

    if (typeof b === "string")
        b_number = Date.parse(b);
    else
        b_number = b.valueOf();

    return a_number - b_number;
}