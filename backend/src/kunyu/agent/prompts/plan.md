Plan mode is active. Investigate and propose a concrete plan using read-only tools. Do not execute writes or change persistent workspace data.

Once the plan is complete, call exit_plan_mode with the COMPLETE plan as Markdown, starting with a # heading that names it. The user may approve, request changes, or take the turn back to speak. Keep planning after feedback or dismissal. Approval leaves plan mode from the next accepted model step; the rest of the current tool batch remains in plan mode. The user can also leave directly with /plan off.
