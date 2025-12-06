
/* Accepts javascript date object and Returns full date in YYYY-MM-DD format. */
var getFullDate = function(dateObj) {
    var month = dateObj.getMonth() + 1;
    var date = dateObj.getDate();
    return dateObj.getFullYear() + "-" + ((month <= 9) ? ("0" + month) : month) + "-" + ((date <= 9) ? ("0" + date) : date);
}
exports.getFullDate = getFullDate;

/* Accepts javascript date object and Returns full date in YYYY-MM-DD HH:MM:SS format. */
var getFullDateTime = function(dateObj) {

    var month = dateObj.getMonth() + 1;
    var date = dateObj.getDate();
    var hours = dateObj.getHours();
    var minutes = dateObj.getMinutes();
    var seconds = dateObj.getSeconds();


    var dateStr = dateObj.getFullYear() + "-" + ((month <= 9) ? ("0" + month) : month) + "-" + ((date <= 9) ? ("0" + date) : date);
    var timeStr = ((hours <= 9) ? ("0" + hours) : hours) + ":" + ((minutes <= 9) ? ("0" + minutes) : minutes) + ":" + ((seconds <= 9) ? ("0" + seconds) : seconds);

    return dateStr + " " + timeStr;
}
exports.getFullDateTime = getFullDateTime;


function nextDayAndTime(dayOfWeek) {
    var now = new Date()
    var result = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + (7 + dayOfWeek - now.getDay()) % 7)

    if (result < now)
        result.setDate(result.getDate() + 7)
    return result
}

var getFutureDateOfDay = function(data) {
    var dates = new Date(nextDayAndTime(data).toString());;
    var year = dates.getFullYear();
    var month = dates.getMonth() + 1;
    var day = dates.getDate();
    var format = `'` + year + `-` + month + `-` + day + `'`;
    return format;
}

exports.getFutureDateOfDay = getFutureDateOfDay;


/**
 * Returns the last date of the month.
 * @params - month:string (ex: "2019-09"), n:number (ex: 3)
 * @returns - date:string in format "YYYY-MM-DD" (ex: "31-12-2020")
 **/
// function getLastDate(month) {
//   var ym = month.split("-");
//   return getFullDate( new Date( Number(ym[0]), Number(ym[1]), 0, 0, 0, 0 ) );
// }
function getLastDate(month, type) {
    var ym = month.split("-");
    var lastDate = new Date(Number(ym[0]), Number(ym[1]), 0, 0, 0, 0);
    if (!type || type == 'string') {
        return getFullDate(lastDate);
    } else if (type = 'Date') {
        return lastDate;
    } else {
        return 'Requested type is not expected!'
    }
}
exports.getLastDate = getLastDate;