from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class MembershipRole(StrEnum):
    OWNER = 'OWNER'
    MEMBER = 'MEMBER'


class Organization(Base):
    __tablename__ = 'organizations'

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class OrganizationMembership(Base):
    __tablename__ = 'organization_memberships'

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey('users.id', ondelete='CASCADE'), primary_key=True
    )
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey('organizations.id', ondelete='CASCADE'), primary_key=True
    )
    role: Mapped[MembershipRole] = mapped_column(
        Enum(MembershipRole, name='membership_role')
    )
