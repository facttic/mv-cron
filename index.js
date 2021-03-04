require("dotenv").config();
const config = require("config");
const MvModels = require("mv-models");

const { SchedulerConfig } = require("./scheduler");
const { LoggerConfig } = require("./common/logger");
const { getDbUri } = require("./helpers/db");
const { normalizeAndLogError } = require("./helpers/errors");

const dbUri = getDbUri(config);

(async () => {
  try {
    LoggerConfig.init();
    await MvModels.init(dbUri);
    await SchedulerConfig.init();

    process.env.NODE_ENV !== "test" && LoggerConfig.getChild("server.js").info("Cron started");
  } catch (err) {
    normalizeAndLogError("index", err);
    process.exit(1);
  }
})();
