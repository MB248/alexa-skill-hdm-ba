const Alexa = require('ask-sdk');
const ical = require('ical');
const fragenkatalog = require('./fragenkatalog');
const raumListe = require('./raeume');
const got = require('got');

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
  },
  handle(handlerInput) {
    const speechText = standardStrings.WELCOME_MESSAGE;
    const reprompt = standardStrings.WELCOME_REPROMPT;

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(reprompt)
      .withSimpleCard(standardStrings.SKILL_NAME, 'Herzlich willkommen!')
      .getResponse();
  },
};

const abrufFAQHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'abfrageFAQ';
  },
  handle(handlerInput) {

    const signalWord = handlerInput.requestEnvelope.request.intent.slots.fragen.resolutions.resolutionsPerAuthority[0].values[0].value.name.toLowerCase();
    const displayText = fragenkatalog[signalWord];
    const speechText = replaceForSpeech(displayText);


    return handlerInput.responseBuilder
      .speak(speechText)
      .withSimpleCard(standardStrings.SKILL_NAME, displayText)
      .getResponse();
  },
};

let url = "";
let speechOutput = "";

const abrufSPHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'abfrageStundenplan';
  },
  async handle(handlerInput) {

    const anrede = handlerInput.requestEnvelope.request.intent.slots.anrede.value;

    if (anrede != undefined){
      return handlerInput.responseBuilder
      .speak("Tut mir leid, diese Funktion ist derzeit noch nicht implementiert.")
      .withSimpleCard(standardStrings.SKILL_NAME,"")
      .getResponse();
    }


    // Benutzereingaben
    const raum = handlerInput.requestEnvelope.request.intent.slots.raumID.resolutions.resolutionsPerAuthority[0].values[0].value.name.toLowerCase();
    const zeit = handlerInput.requestEnvelope.request.intent.slots.zeit.value;
    const datum = handlerInput.requestEnvelope.request.intent.slots.datum.value;

    console.log("User Input (raum): " + raum);
    console.log("User Input (zeit): " + zeit);
    console.log("User Input (datum): " + datum);

    // Erstellt einen url oder 'none' String
    url = createURL(raum);

    let eventList = new Array();
    let relevantEvents = new Array();

    // Wenn url 'none' ist, dann Anfrage beenden
    if (url == 'none') {
      console.log('Keine URL');
      return handlerInput.responseBuilder
        .speak("Raum " + raum + " ist für den angefragten Zeitraum verfügbar!")
        .withSimpleCard(standardStrings.SKILL_NAME, "Raum " + raum + " ist für den angefragten Zeitraum verfügbar!")
        .getResponse();
    }

    let result = await got(url).then(response => {

      let data = ical.parseICS(response.body);

      for (let k in data) {
        if (data.hasOwnProperty(k)) {
          let ev = data[k];
          let eventData = {
            start: ev.start,
            end: ev.end
          };
          eventList.push(eventData);
        }
      }
      return response.body
    }).catch(error => {
      console.log('Keine Inhalte im ICS gefunden');
      return handlerInput.responseBuilder
        .speak("Raum " + raum + " ist für den angefragten Zeitraum verfügbar!")
        .withSimpleCard(standardStrings.SKILL_NAME, "Raum " + raum + " ist für den angefragten Zeitraum verfügbar!")
        .getResponse();
    });

    // Liest die Slot Informationen ein und gibt die angefragte Zeit in Millisekunden zurück.
    // Außerdem werden je nach Benutzereingaben, Antworten-Strings zusammengestellt -> speechOutput
    let requestedTime = getRequestedTime(datum, zeit, raum);

    // Wandelt requestedTime in ein eventDate-Objekt um - gefüllt mit Start und End Datum
    // Um einen Zeitraum zu ermitteln
    const eventDate = getDateFromSlot(requestedTime);

    // Wird benutzt, um herauszufinden, ob der Raum besetzt ist.
    let isOccupied = false;

    // Wenn ein ein Startdatum + Enddatum ermittelt wurde
    if (eventDate.startDate && eventDate.endDate) {

      // Array wird mit Daten gefüllt, die sich im Zeitraum befinden, initiiert 
      // findet alle Events, an denen eine Veranstaltung stattfindet
      relevantEvents = getEventsBetweenDates(eventDate.startDate, eventDate.endDate, eventList);
      // findet alle Events, an denen keine Veranstaltung stattfindet
      freeEvents = getFreeEvents(relevantEvents, requestedTime);
      // Vergleicht nun, ob die angefragte Zeit sich mit der besetzten Zeit überlappt
      isOccupied = getEventsBetweenTimes(relevantEvents, requestedTime);

      console.log("freeEvents Length: " + freeEvents.length);
      console.log("istOccupied: " + isOccupied);
      console.log("speechOutput " + speechOutput);

      if (datum != undefined && zeit == undefined) {

        for (let i = 0; i < freeEvents.length; i++) {
          let tempData = new Date(freeEvents[i])
          
          speechOutput += " um " + tempData.getHours() + ":" + addZero(tempData.getMinutes()) + " ";

          if(freeEvents.length > 1){
            if (i == freeEvents.length-2){
              speechOutput += "und"
            } else if (i < freeEvents.length-2){
              speechOutput += ", "
            }
          } 

          console.log("Inhalt freeEvents" + freeEvents[i]);
        }

        if (freeEvents.length > 0) {
          console.log("7: Datum, ohne Zeit - Raum ist frei");
          speechOutput += "frei."
        } else {
          console.log("7: Datum, ohne Zeit - Raum ist besetzt");
          speechOutput += "besetzt."
        }

      } else {

        if (isOccupied) {
          console.log("7: Rest - Raum ist frei");
          speechOutput += "besetzt."
        } else {
          console.log("7: Rest - Raum ist frei");
          speechOutput += "frei.";
        }
      }

      return handlerInput.responseBuilder
        .speak(speechOutput)
        .withSimpleCard(standardStrings.SKILL_NAME, speechOutput)
        .getResponse();

    } else {
      speechOutput = "Tut mir Leid. Ich habe die Raumnummer nicht verstanden. Könnten Sie Ihre Anfrage wiederholen?"

      return handlerInput.responseBuilder
        .speak(speechOutput)
        .withSimpleCard(standardStrings.SKILL_NAME, speechOutput)
        .getResponse();
    }
  }
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const speechText = standardStrings.HELP_MESSAGE;

    return handlerInput.responseBuilder
      .speak(speechText)
      .withSimpleCard(standardStrings.SKILL_NAME, speechText)
      .getResponse();

  }
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && (handlerInput.requestEnvelope.request.intent.name === 'AMAZON.CancelIntent'
        || handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    const speechText = standardStrings.STOP_MESSAGE;

    return handlerInput.responseBuilder
      .speak(speechText)
      .withSimpleCard('Digital Publishing', speechText)
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log('Session ended with reason: ${handlerInput.requestEnvelope.request.reason}');

    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log('Error handled: ' + error);

    return handlerInput.responseBuilder
      .speak(standardStrings.ERROR_MESSAGE)
      .reprompt(standardStrings.ERROR_MESSAGE)
      .getResponse();
  },
};


/* FUNKTIONEN-START */

function replaceForSpeech(displayText) {
  let speechText = displayText;

  speechText = speechText.replace(new RegExp('Digital Publishing', 'g'), standardStrings.DIGITAL_PUBLISHING);
  speechText = speechText.replace(new RegExp('IT', 'g'), '<phoneme alphabet="ipa" ph="aɪti">IT</phoneme>');

  return speechText;
}

function getRaumString(raumnummer, buchstabe) {
  let raumString = raumnummer;

  if (buchstabe != undefined) {
    if (buchstabe == "S" || buchstabe == "P" || buchstabe == "U" || buchstabe == "I" || buchstabe == "IU") {
      raumString = buchstabe + "" + raumnummer
    } else {
      raumString = none;
    }
  }

  return raumString;
}

function createURL(raumID) {
  let url = "https://splan.hdm-stuttgart.de/splan/ical?lan=de&puid=8&type=room&roomid=";

  const raumId = raumListe[raumID];

  if (raumId == undefined || raumID == undefined) {
    url = 'none';
  } else {
    url += raumId;
  }

  return url
}

function removeTags(str) {
  if (str) {
    return str.replace(/<(?:.|\n)*?>/gm, '');
  }
}

function getDateFromSlot(rawDate) {
  // Versucht Daten zu parsen
  let date = rawDate > 0 ? new Date(rawDate) : new Date(Date.parse(rawDate));
  let eventDate = {

  };

  // if could not parse data must be one of the other formats
  if (isNaN(date)) {
    // to find out what type of date this is, we can split it and count how many parts we have see comments above.
    const res = rawDate.split("-");
    // if we have 2 bits that include a 'W' week number
    if (res.length === 2 && res[1].indexOf('W') > -1) {
      let dates = getWeekData(res);
      eventDate["startDate"] = new Date(dates.startDate);
      eventDate["endDate"] = new Date(dates.endDate);
      // if we have 3 bits, we could either have a valid date (which would have parsed already) or a weekend
    } else if (res.length === 3) {
      let dates = getWeekendData(res);
      eventDate["startDate"] = new Date(dates.startDate);
      eventDate["endDate"] = new Date(dates.endDate);
      // anything else would be out of range for this skill
    } else {
      eventDate["error"] = dateOutOfRange;
    }
    // original slot value was parsed correctly
  } else {
    eventDate["startDate"] = new Date(date).setUTCHours(0, 0, 0, 0);
    eventDate["endDate"] = new Date(date).setUTCHours(24, 0, 0, 0);
  }
  return eventDate;
}

// Given a week number return the dates for both weekend days
function getWeekendData(res) {
  if (res.length === 3) {
    const saturdayIndex = 5;
    const sundayIndex = 6;
    const weekNumber = res[1].substring(1);

    const weekStart = w2date(res[0], weekNumber, saturdayIndex);
    const weekEnd = w2date(res[0], weekNumber, sundayIndex);

    return {
      startDate: weekStart,
      endDate: weekEnd,
    };
  }
}

// Given a week number return the dates for both the start date and the end date
function getWeekData(res) {
  if (res.length === 2) {

    const mondayIndex = 0;
    const sundayIndex = 6;

    const weekNumber = res[1].substring(1);

    const weekStart = w2date(res[0], weekNumber, mondayIndex);
    const weekEnd = w2date(res[0], weekNumber, sundayIndex);

    return {
      startDate: weekStart,
      endDate: weekEnd,
    };
  }
}

// Used to work out the dates given week numbers
const w2date = function (year, wn, dayNb) {
  const day = 86400000;

  const j10 = new Date(year, 0, 10, 12, 0, 0),
    j4 = new Date(year, 0, 4, 12, 0, 0),
    mon1 = j4.getTime() - j10.getDay() * day;
  return new Date(mon1 + ((wn - 1) * 7 + dayNb) * day);
};

function getEventsBetweenDates(startDate, endDate, eventList) {

  const start = new Date(startDate);
  const end = new Date(endDate);

  let data = new Array();

  for (let i = 0; i < eventList.length; i++) {
    if (start <= eventList[i].start && end >= eventList[i].start) {
      data.push(eventList[i]);
    }
  }

  console.log("FOUND " + data.length + " events between those times");
  return data;
}

function getEventsBetweenTimes(relevantEvents, requestedTime) {

  const time = new Date(requestedTime);
  let data = false;

  for (let i = 0; i < relevantEvents.length; i++) {
    if (time >= relevantEvents[i].start && time <= relevantEvents[i].end) {
      data = true;
    }
  }

  return data;
}

function getRequestedTime(datum, zeit, raumID) {

  console.log("Enter getRequestedTime Function");

  if (datum == undefined && zeit == undefined) {
    let data = Date.now();
    speechOutput = "Raum " + raumID + " ist momentan ";

    console.log("4: Weder Datum noch Zeit - speechOutput " + speechOutput)
    return data;
  } else if (datum != undefined && zeit == undefined) {
    const tempDate = getDateFromSlot(datum);
    let data = new Date(tempDate.startDate);
    speechOutput = "Raum " + raumID + " ist für den " + toReadableDateString(datum) + " ";

    console.log("4: Nur Datum, Keine Zeit - speechOutput " + speechOutput)
    return data;
  } else if (datum == undefined && zeit != undefined) {
    const tempDate = new Date();
    let data = tempDate.setUTCHours(zeit.split(":")[0], zeit.split(":")[1], 0, 0);
    speechOutput = "Raum " + raumID + " ist um " + zeit + " ";

    console.log("4: Nur Zeit, kein Datum - speechOutput " + speechOutput)
    return data;
  } else {
    const tempDate = new Date(datum);
    let data = tempDate.setUTCHours(zeit.split(":")[0], zeit.split(":")[1], 0, 0);
    speechOutput = "Raum " + raumID + " ist am " + toReadableDateString(datum) + " um " + zeit + " ";

    console.log("4: Zeit und Datum - speechOutput " + speechOutput)
    return data;
  }
}

function toReadableDateString(datum){
  let newDatum = new Date(datum);
  let datumString = newDatum.getDate() + ". " + monate[newDatum.getMonth()] + " " + newDatum.getFullYear();

  return datumString;
}

function addZero(i) {
  if (i < 10) {
      i = "0" + i;
  }
  return i;
}

function getFreeEvents(relevantEvents, requestedTime) {

  let dateAnfang = new Date(requestedTime);
  let dateEnde = new Date(requestedTime);
  let data = new Array();

  for (let i = 0; i < blockZeitenAnfang.length; i++) {
    let tempDate = dateAnfang.setUTCHours(blockZeitenAnfang[i].split(":")[0], blockZeitenAnfang[i].split(":")[1], 0, 0);
    dateEnde.setUTCHours(blockZeitenEnde[i].split(":")[0], blockZeitenEnde[i].split(":")[1], 0, 0);

    if (relevantEvents.some(rE => rE.start.getTime() >= dateAnfang.getTime() || rE.end.getTime() >= dateAnfang.getTime())) {

    } else {
      data.push(tempDate);
      console.log("getFreeEvents - Freie Zeiten: " + dateAnfang);
    }
  }
  return data;
}

/* FUNKTIONEN-ENDE */


/* KONFIGURATIONEN */
const skillBuilder = Alexa.SkillBuilders.custom();
const standardStrings = {
  FRAGENKATALOG: fragenkatalog,
  DIGITAL_PUBLISHING: '<phoneme alphabet="ipa" ph="dɪd͡ʒɪtæl pablɪʃɪŋ">Digital Publishing</phoneme>',
  SKILL_NAME: 'Digital Publishing',
  HELP_MESSAGE: 'Hier erhalten Sie Informationen zum Studiengang <phoneme alphabet="ipa" ph="dɪd͡ʒɪtæl pablɪʃɪŋ">Digital Publishing</phoneme>, allgemeine organisatorische Termine der HdM, Raumbelegungen und Informationen zur Dozentenanwesenheit.', 
  WELCOME_MESSAGE: 'Herzlich Willkommen beim <phoneme alphabet="ipa" ph="dɪd͡ʒɪtæl pablɪʃɪŋ">Digital Publishing</phoneme> Skill.',
  WELCOME_REPROMPT: 'Wenn Sie wissen möchten, was Sie fragen können, sagen Sie einfach "Hilfe".',
  STOP_MESSAGE: 'Auf wiedersehen!',
  ERROR_MESSAGE: 'Entschuldigung, ich habe Sie nicht verstanden. Können Sie das wiederholen?'
}

const blockZeitenAnfang = ["8:15", "10:00", "11:45", "13:15", "14:15", "16:00", "17:45"]
const blockZeitenEnde = ["9:45", "11:30", "13:15", "14:15", "15:45", "17:30", "19:15"]
const monate = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "Oktober", "November", "Dezember"];

exports.handler = skillBuilder
  .addRequestHandlers(
    LaunchRequestHandler,
    abrufFAQHandler,
    abrufSPHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();