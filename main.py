from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def hello():
    return {"message": "Flyt.io is live"}
