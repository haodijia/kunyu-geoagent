"""Typed control boundaries for the default Agent loop."""

import asyncio
from dataclasses import dataclass
from typing import Literal, Protocol

from kunyu.agent.runtime.events import ModelSnapshotPayload, StepMessagePayload
from kunyu.agent.runtime.models import ModelOutput
from kunyu.agent.runtime.run_state import ReducedRun


@dataclass(frozen=True, slots=True)
class CancellationSignal:
    task: asyncio.Task

    def throw_if_cancelled(self) -> None:
        if self.task.cancelling():
            raise asyncio.CancelledError


@dataclass(frozen=True, slots=True)
class StepProposal:
    run: ReducedRun
    step: int
    attempt: int
    messages: tuple[StepMessagePayload, ...]
    signal: CancellationSignal


@dataclass(frozen=True, slots=True)
class EnterStep:
    messages: tuple[StepMessagePayload, ...]
    kind: Literal["enter"] = "enter"


@dataclass(frozen=True, slots=True)
class RejectStep:
    reason: str
    kind: Literal["reject"] = "reject"


type StepDecision = EnterStep | RejectStep


@dataclass(frozen=True, slots=True)
class RequestFailure:
    code: str
    message: str


type RequestErrorAction = Literal["retry"] | None


class LoopHooks(Protocol):
    async def pre_step(self, proposal: StepProposal) -> StepDecision: ...

    async def request(
        self, run: ReducedRun, seed: ModelSnapshotPayload, signal: CancellationSignal
    ) -> ModelSnapshotPayload: ...

    async def request_error(
        self, run: ReducedRun, failure: RequestFailure, signal: CancellationSignal
    ) -> RequestErrorAction: ...

    async def turn_stopping(
        self, run: ReducedRun, signal: CancellationSignal
    ) -> None: ...

    def error(self, run: ReducedRun, error: BaseException) -> None: ...

    def assistant_output(self, run: ReducedRun, output: ModelOutput) -> None: ...

    def assistant_abandoned(self, run: ReducedRun) -> None: ...
