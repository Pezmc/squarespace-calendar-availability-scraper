require('dotenv').config()

const cheerio = require('cheerio')
const dayjs = require('dayjs')
const fs = require('fs')
const Pushover = require('pushover-notifications')

const requireEnvs = (names) => {
  const missing = []

  for (const name of names) {
    if (!process.env[name]) {
      missing.push(name)
    }
  }

  if (missing.length) {
    throw new Error(
      `Expected environment variable${missing.length > 1 ? 's' : ''} ${missing.join(
        ', ',
      )} to be set`,
    )
  }
}

const pushover = new Pushover({
  user: process.env.PUSHOVER_USER,
  token: process.env.PUSHOVER_TOKEN,
})

const getAvailability = async (type, date) => {
  const params = new URLSearchParams({
    appointmentType: [].concat(type),
    calendar: process.env.CALENDAR_ID,
    calendarID: '',
    ignoreAppointment: '',
    month: dayjs(date).format('YYYY-MM-DD'),
    'options[numDays]': '5',
    skip: false,
    type,
  })

  const response = await fetch(
    `https://app.squarespacescheduling.com/schedule.php?action=showCalendar&fulldate=1&owner=${process.env.CALENDAR_OWNER}&template=monthly`,
    {
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest',
        Referer: `https://app.squarespacescheduling.com/schedule.php?owner=${process.env.CALENDAR_OWNER}`,
      },
      body: params,
      method: 'POST',
    },
  )

  const body = await response.text()

  const $ = cheerio.load(body)

  const days = $('.scheduleday')
    .map((i, el) => {
      const $el = $(el)
      const date = $el.attr('day')

      return {
        available: $el.is('.activeday'),
        date,
        day: new Date(date).getDate(),
      }
    })
    .toArray()

  return days
}

const sendNotification = (message, title) => {
  const msg = {
    message,
    title,
    sound: 'incoming',
    priority: 0,
    url: process.env.CALENDAR_URL,
  }

  console.log('Sending pushover notification', msg)

  return pushover.send(msg, function (err, result) {
    if (err) {
      throw err
    }

    console.log(result)
  })
}

const loadState = () => {
  try {
    return JSON.parse(fs.readFileSync(process.env.STATE_FILE, { encoding: 'utf8', flag: 'r' }))
  } catch (error) {
    console.warn('No saved state found, loading new availability')
  }
}

const writeState = (newAvailability) => {
  try {
    const fileName = process.env.STATE_FILE
    fs.writeFileSync(fileName, JSON.stringify(newAvailability, null, 2))
    console.log(`Availability saved to ${fileName}.`)
  } catch (error) {
    console.warn('Availability could not be written to disk.', error)
  }
}

const compareAvailability = (previousAvailabilities = [], newAvailabilities = []) => {
  const previousByDate = new Map(
    previousAvailabilities.map((day) => {
      return [day.date, day.available]
    }),
  )

  const newByDate = new Map(
    newAvailabilities.map((day) => {
      return [day.date, day.available]
    }),
  )

  const newlyAvailableDates = []

  for (const [previousDate, previousAvailability] of previousByDate) {
    if (newByDate.has(previousDate)) {
      const newAvailability = newByDate.get(previousDate)
      if (newAvailability !== previousAvailability) {
        console.log(
          `Change in availability: ${previousDate} is now ${
            newAvailability ? 'available' : 'taken'
          } (was previously ${previousAvailability.available ? 'available' : 'taken'})`,
        )

        if (newAvailability) {
          newlyAvailableDates.push(previousDate)
        }
      }
    } else {
      console.log(`${previousDay.date} not found in new availability`)
    }
  }

  return newlyAvailableDates
}

const main = async () => {
  requireEnvs([
    'PUSHOVER_USER',
    'PUSHOVER_TOKEN',
    'CALENDAR_URL',
    'CALENDAR_OWNER',
    'CALENDAR_ID',
    'APPOINTMENT_TYPE',
    'STATE_FILE',
  ])

  const previousAvailability = loadState()

  const appointmentTypes = process.env.APPOINTMENT_TYPE.split(',')
  const newAvailability = [
    ...(await getAvailability(appointmentTypes, dayjs())),
    ...(await getAvailability(appointmentTypes, dayjs().add(1, 'month'))),
    ...(await getAvailability(appointmentTypes, dayjs().add(2, 'month'))),
    ...(await getAvailability(appointmentTypes, dayjs().add(3, 'month'))),
  ]

  console.info(`= Current Availability =`, newAvailability)

  const newlyAvailableDates = compareAvailability(previousAvailability, newAvailability)

  writeState(newAvailability)

  // Send pushover notification
  if (newlyAvailableDates.length > 0) {
    const message = `Appointments now available on ${newlyAvailableDates.join(', ')}`
    const title = 'New Appointments Available'
    sendNotification(message, title)
  }
}

main()
