Before performing any task, carefully review the existing code, architecture, logic, and dependencies to ensure that the requested changes do not break, conflict with, or negatively affect any existing functionality or previously completed work.

Every modification must preserve existing functionality unless a change is explicitly required. Before implementing new logic, identify potential dependencies, side effects, and compatibility issues, and ensure that the overall system remains stable, organized, maintainable, secure, and fully functional after the changes.


### System Redesign Rules

Before redesigning or modifying any part of the system, first understand the existing architecture, codebase, database structure, business logic, workflows, dependencies, APIs, and integrations.

The redesign must follow these rules:

1. **Never break existing functionality.**
   Every existing feature, workflow, API, database operation, and previously completed implementation must continue to work unless a change is explicitly required.

2. **Analyze before changing.**
   Do not immediately modify code. First identify how the existing system works, what depends on it, and what potential side effects the proposed change may introduce.

3. **Preserve working logic.**
   Reuse and improve existing logic whenever possible instead of unnecessarily rewriting or replacing working code.

4. **Maintain backward compatibility.**
   Changes to APIs, database schemas, data structures, queues, services, or internal interfaces must not unexpectedly break existing components.

5. **Redesign based on the complete system.**
   Do not optimize one component in isolation. Consider the impact on the entire application, including frontend, backend, workers, database, cache, queues, APIs, authentication, monitoring, and deployment.

6. **Improve, don't complicate.**
   The redesigned architecture should be simpler, cleaner, faster, more secure, scalable, maintainable, and easier to understand. Avoid unnecessary abstraction, complexity, or over-engineering.

7. **Database safety is mandatory.**
   Never make destructive database changes without first understanding existing data, relationships, indexes, constraints, migrations, and dependencies. Existing data must be protected.

8. **Keep responsibilities clearly separated.**
   Each service, module, function, and component should have a clear responsibility and should not contain unnecessary or duplicated logic.

9. **Consider performance and scalability.**
   Every redesign should consider CPU, memory, database load, network usage, concurrency, queue processing, caching, worker utilization, and future growth.

10. **Consider failure scenarios.**
    The system must handle errors, timeouts, retries, partial failures, duplicate requests, worker failures, database failures, and service interruptions gracefully.

11. **Security must not be weakened.**
    Any redesign must preserve or improve authentication, authorization, input validation, data protection, secrets management, rate limiting, and other security controls.

12. **Do not remove existing features without verification.**
    A feature should only be removed or replaced after confirming that it is unnecessary and that removing it will not affect another part of the system.

13. **Test after every significant change.**
    Verify affected functionality and important existing functionality after modifications. Do not assume that a successful build means the system is working correctly.

14. **Keep the codebase organized.**
    Maintain consistent project structure, naming conventions, coding standards, documentation, configuration, and dependency management.

15. **Avoid unnecessary rewrites.**
    Do not rewrite the entire system simply because a different approach looks better. Only redesign components when there is a clear technical benefit.

16. **Track dependencies and side effects.**
    Before changing a shared function, database table, API, queue, service, or configuration, identify all components that depend on it.

17. **Use incremental redesign whenever possible.**
    Prefer safe, controlled changes that can be verified step-by-step rather than making large uncontrolled changes across the entire system.

18. **Maintain observability.**
    Important operations should remain measurable and debuggable through appropriate logging, metrics, health checks, tracing, and error reporting.

19. **Do not assume. Verify.**
    If existing behavior, implementation details, dependencies, or data structures are unclear, inspect the actual code and configuration before making a decision.

20. **Final system integrity check.**
    After completing the redesign, verify that the system remains functional end-to-end and that the redesign has not introduced regressions, broken dependencies, data inconsistencies, performance problems, or security issues.

### Core Principle

**Understand → Analyze → Plan → Modify → Test → Verify.**

The goal of the redesign is not simply to change the code. The goal is to improve the overall system while preserving existing functionality, data integrity, reliability, security, performance, scalability, and maintainability.
