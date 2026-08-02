from __future__ import annotations

import logging
import sys
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

# Resolved relative to this file rather than the process cwd - the app
# runs with different working directories depending on context (Docker's
# WORKDIR is /backend, but e.g. the pytest pre-commit hook runs from the
# repo root - see config.py's _ENV_FILE for the same fix applied there),
# and a bare relative path silently writes the log file wherever the
# process happened to be launched from.
DEFAULT_LOG_FILE = "./.logs/backend.log"
DEFAULT_LOG_LEVEL = logging.INFO
DEFAULT_LOG_FORMAT = "%(asctime)s | %(levelname)s | %(name)s | %(lineno)d | %(message)s"

# Third-party loggers that are all signal-to-noise ratio zero at INFO -
# every logger propagates to root by default, so without this they drown
# out the app's own logging (confirmed: watchfiles.main alone was 107,262
# of 107,263 lines in a real backend.log - it logs a line on every single
# file-change poll during `fastapi dev`'s --reload, which is dev-only
# noise, not something worth ever seeing at INFO). WARNING+ still comes
# through for all of these if something actually goes wrong.
_NOISY_LOGGER_NAMES = ["watchfiles", "watchfiles.main"]


class LogManager:
    """
    A singleton class to manage and configure application logging
    """

    _instance: "LogManager" | None = None
    _loggers: dict[str, logging.Logger] = {}

    def __new__(cls, *args, **kwargs) -> "LogManager":
        """
        Controls object creation to ensure singleton behaviour
        """

        if cls._instance is None:
            cls._instance = super(LogManager, cls).__new__(cls)
            cls._instance._configure_root_logger()
        return cls._instance

    def _configure_root_logger(self) -> None:
        """
        Initializes and configures the main global settings for all loggers
        """

        log_path = Path(DEFAULT_LOG_FILE)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.touch(exist_ok=True)

        root_logger = logging.getLogger()
        root_logger.setLevel(DEFAULT_LOG_LEVEL)
        formatter = logging.Formatter(DEFAULT_LOG_FORMAT)

        # Only One Console handler
        if not any(
            isinstance(handler, logging.StreamHandler)
            for handler in root_logger.handlers
        ):
            console_handler = logging.StreamHandler(sys.stdout)
            console_handler.setFormatter(formatter)

            root_logger.addHandler(console_handler)

        # Have one file/timed-rotating handler
        if not any(
            isinstance(handler, TimedRotatingFileHandler)
            for handler in root_logger.handlers
        ):
            file_handler = TimedRotatingFileHandler(
                DEFAULT_LOG_FILE,
                when="midnight",
                interval=1,
                backupCount=7,
                encoding="utf-8",
            )
            file_handler.setFormatter(formatter)
            root_logger.addHandler(file_handler)

        for noisy_name in _NOISY_LOGGER_NAMES:
            logging.getLogger(noisy_name).setLevel(logging.WARNING)

    def get_logger(self, name: str) -> logging.Logger:
        """
        Retrives a module-specific logger by name, creating it if it does not exist
        """

        if name not in self._loggers:
            logger = logging.getLogger(name)
            logger.setLevel(DEFAULT_LOG_LEVEL)
            self._loggers[name] = logger

        return self._loggers[name]

    def setup_security_logger(self) -> None:
        """
        Configures `fastapi_guard` logger
        """

        logger = logging.getLogger("fastapi_guard")
        logger.setLevel(DEFAULT_LOG_LEVEL)

        logger.propagate = True

        self._loggers["fastapi_guard"] = logger
        logger.info("Security logger configured successfully")


log_manager = LogManager()


def get_app_logger(name: str = __name__) -> logging.Logger:
    """
    Public convenience function to get logger instance. All other files call this to get their logger
    """
    log_manager.setup_security_logger()
    return log_manager.get_logger(name)
