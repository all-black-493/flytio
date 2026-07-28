from pydantic import BaseModel


class PermissionRead(BaseModel):
    codename: str
    name: str
    content_type: str


class GroupCreate(BaseModel):
    name: str


class GroupRead(BaseModel):
    id: int
    name: str
    permissions: list[str]


class AssignPermissionsRequest(BaseModel):
    codenames: list[str]


class AssignGroupsRequest(BaseModel):
    group_ids: list[int]
