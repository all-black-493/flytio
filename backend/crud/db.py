from sqlmodel import Session, create_engine

from backend.config import settings

# echo=False: SQLAlchemy's own query-echo attaches its own handler to the
# "sqlalchemy.engine" logger independent of utils/log_manager.py's root
# logger config, which - now that both exist - doubled up every SQL
# statement as two differently-formatted lines. Blasting every query to
# logs at INFO is also not something you want unconditionally in
# production. Flip this to True locally if you need to see raw SQL.
engine = create_engine(
    settings.DATABASE_URL,
    echo=False,
    # Both of these exist for serverless Postgres (Neon), which suspends
    # the compute after a few minutes idle and drops every connection with
    # it. A pooled connection handed out afterwards is already dead, and
    # the request fails with "SSL SYSCALL error: EOF detected" - reliably,
    # on the first request after any quiet spell, which is exactly when a
    # real visitor arrives. pre_ping spends one round trip proving a
    # connection is alive before handing it over; recycle stops one being
    # kept past the suspend timeout in the first place.
    pool_pre_ping=True,
    pool_recycle=280,
)


def get_session():
    with Session(engine) as session:
        yield session
