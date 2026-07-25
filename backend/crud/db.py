from sqlmodel import Session, create_engine, SQLModel

from backend.config import settings

engine = create_engine(settings.DATABASE_URL, echo=True)


def get_session():
    with Session(engine) as session:
        yield session


def init_db():
    import backend.models  # noqa: F401  (registers all tables on SQLModel.metadata)

    SQLModel.metadata.create_all(engine)
