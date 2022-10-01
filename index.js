require('dotenv').config()

const fs = require('fs')
const path = require('path')

const cheerio = require('cheerio')
const dayjs = require('dayjs')
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

const availabilityByDate = (availabilityArray) => {
  return new Map(
    availabilityArray.map((day) => {
      return [day.date, day.available]
    }),
  )
}

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
    const rawState = fs.readFileSync(process.env.STATE_FILE, { encoding: 'utf8', flag: 'r' })
    const stateObject = JSON.parse(rawState)
    return new Map(Object.entries(stateObject))
  } catch (error) {
    console.warn('No saved state found, loading new availability')
  }
}

const writeState = (newAvailability) => {
  const newAvailabilityObject = Object.fromEntries(newAvailability)

  try {
    const fileName = process.env.STATE_FILE
    const directory = path.dirname(fileName)
    if (directory) {
      fs.mkdirSync(directory, { recursive: true })
    }
    fs.writeFileSync(fileName, JSON.stringify(newAvailabilityObject, null, 2))
    console.log(`Availability saved to ${fileName}.`)
  } catch (error) {
    console.warn('Availability could not be written to disk.', error)
  }
}

const compareAvailability = (previousByDate = [], newByDate = []) => {
  console.info('= Previous Availability')
  console.info(previousByDate)

  console.info('= New Availability')
  console.info(newByDate)

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
      console.log(`${previousDate} not found in new availability`)
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

  const previousAvailabilityByDate = loadState()

  const appointmentTypes = process.env.APPOINTMENT_TYPE.split(',')
  const newAvailability = [
    ...(await getAvailability(appointmentTypes, dayjs())),
    ...(await getAvailability(appointmentTypes, dayjs().add(1, 'month'))),
    ...(await getAvailability(appointmentTypes, dayjs().add(2, 'month'))),
    ...(await getAvailability(appointmentTypes, dayjs().add(3, 'month'))),
  ]

  const newAvailabilityByDate = availabilityByDate(newAvailability)

  const newlyAvailableDates = compareAvailability(previousAvailabilityByDate, newAvailabilityByDate)

  console.log(`Newly available dates: ${newlyAvailableDates.length ? newlyAvailableDates : 'None'}`)

  writeState(newAvailabilityByDate)

  // Send pushover notification
  if (newlyAvailableDates.length > 0) {
    const message = `Appointments now available on ${newlyAvailableDates.join(', ')}`
    const title = 'New Appointments Available'
    sendNotification(message, title)
  }
}

main()
