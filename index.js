require("dotenv").config();
const config = require("config");
const MvModels = require("mv-models");

const { SchedulerConfig } = require("./CRON");

const dbHost = config.get("db.host");
const dbPort = config.get("db.port");
const dbName = config.get("db.name");
const dbUsername = config.get("db.username");
const dbPassword = config.get("db.password");
const dbAuth = config.get("db.auth");

const dbUri = `mongodb://${
  dbUsername ? `${dbUsername}:${dbPassword}@` : ""
}${dbHost}:${dbPort}/${dbName}${dbAuth ? `?authSource=${dbAuth}` : ""}`;

MvModels.init(dbUri)
  .then(() => {
    SchedulerConfig.init();
  })
  .catch((err) => {
    console.error(err);
  });
