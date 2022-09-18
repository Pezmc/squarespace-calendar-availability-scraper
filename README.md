# Square Space Scheduling Availability Scraper

Tool that uses GitHub actions to scrape availability of appointments managed with Squarespace Scheduling (aka Acuity Online Appointment Scheduling) and send a push notification through PushOver.

## Setup

```
yarn install
cp env.example env
# Edit .env as per below
yarn start # to run locally
```

## Config

- `PUSHOVER_USER`: User API key from PushOver
- `PUSHOVER_TOKEN`: Application API key from PushOver

- `CALENDAR_URL`: URL to link to in push notification

- `CALENDAR_OWNER`: Squarespace calendar owner ID
- `CALENDAR_ID`: Squarespace calendar ID
- `APPOINTMENT_TYPE`: Squarespace appointment type ID

- `STATE_FILE`: Path to file to store state in

## GitHub Action

The GitHub action automatically runs the script using the GitHub scheduled event. 

It stores state from the previous run in the `state` branch.

### Setup

Configure your environment variables as GitHub Secrets.
