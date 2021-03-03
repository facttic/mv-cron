const bunyan = require("bunyan");
const bformat = require("bunyan-format");

const formatOut = bformat({ outputMode: "long" });

let loggerInstance;

class LoggerConfig {
  static init() {
    const test = process.env.NODE_ENV === "test";

    loggerInstance = bunyan.createLogger({
      name: "MV",
      stream: formatOut,
      level: "info",
    });

    if (test) {
      loggerInstance.level(bunyan.FATAL + 1);
    }
  }

  static getChild(moduleName, body = null) {
    const childConfig = { moduleName };
    if (body) {
      childConfig.body = body;
    }
    const log = loggerInstance.child(childConfig, true);
    return log;
  }
}

module.exports = { LoggerConfig };
