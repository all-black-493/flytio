import uuid

from sqlmodel import Session, select

from backend.models.rbac import Group, GroupPermission, Permission, UserGroup


def list_permissions(session: Session) -> list[Permission]:
    return list(session.exec(select(Permission)).all())


def list_groups(session: Session) -> list[Group]:
    return list(session.exec(select(Group)).all())


def get_group(session: Session, group_id: int) -> Group | None:
    return session.get(Group, group_id)


def get_group_by_name(session: Session, name: str) -> Group | None:
    return session.exec(select(Group).where(Group.name == name)).first()


def create_group(session: Session, name: str) -> Group:
    group = Group(name=name)
    session.add(group)
    session.commit()
    session.refresh(group)
    return group


def get_group_permission_codenames(session: Session, group_id: int) -> list[str]:
    return list(
        session.exec(
            select(Permission.codename)
            .join(GroupPermission, GroupPermission.permission_id == Permission.id)
            .where(GroupPermission.group_id == group_id)
        ).all()
    )


def get_permissions_by_codenames(
    session: Session, codenames: list[str]
) -> list[Permission]:
    return list(
        session.exec(select(Permission).where(Permission.codename.in_(codenames))).all()
    )


def get_permission_by_codename(session: Session, codename: str) -> Permission | None:
    return session.exec(
        select(Permission).where(Permission.codename == codename)
    ).first()


def add_group_permissions(
    session: Session, group_id: int, permissions: list[Permission]
) -> None:
    """Idempotent - only inserts links that don't already exist."""
    already_granted = set(get_group_permission_codenames(session, group_id))
    for permission in permissions:
        if permission.codename in already_granted:
            continue
        session.add(GroupPermission(group_id=group_id, permission_id=permission.id))
    session.commit()


def remove_group_permission(session: Session, group_id: int, codename: str) -> None:
    permission = get_permission_by_codename(session, codename)
    if permission is None:
        return
    link = session.get(GroupPermission, (group_id, permission.id))
    if link is not None:
        session.delete(link)
        session.commit()


def get_groups_by_ids(session: Session, group_ids: list[int]) -> list[Group]:
    return list(session.exec(select(Group).where(Group.id.in_(group_ids))).all())


def get_user_group_ids(session: Session, user_id: uuid.UUID) -> list[int]:
    return list(
        session.exec(
            select(UserGroup.group_id).where(UserGroup.user_id == user_id)
        ).all()
    )


def add_user_groups(session: Session, user_id: uuid.UUID, groups: list[Group]) -> None:
    """Idempotent - only inserts memberships that don't already exist."""
    already_member = set(get_user_group_ids(session, user_id))
    for group in groups:
        if group.id in already_member:
            continue
        session.add(UserGroup(user_id=user_id, group_id=group.id))
    session.commit()


def remove_user_group(session: Session, user_id: uuid.UUID, group_id: int) -> None:
    link = session.get(UserGroup, (user_id, group_id))
    if link is not None:
        session.delete(link)
        session.commit()
