export function print_date(date: string | Date) : string {
    if (typeof date === "string")
        return print_date(new Date(date));

    let options = [{weekday: 'short'}, {day: 'numeric'}, {month: 'short'}, {year: 'numeric'}, {hour: 'numeric'}, {minute: 'numeric'} ];

    function format(option: any) {
      let formatter = new Intl.DateTimeFormat('en', option);
      return formatter.format(date);
   }
   return options.map(format).join(' ') + " UTC";
}