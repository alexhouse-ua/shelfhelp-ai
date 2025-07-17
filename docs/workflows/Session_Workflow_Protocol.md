# Session Workflow Protocol - ShelfHelp AI

**Created**: July 14, 2025  
**Updated**: July 17, 2025  
**Purpose**: Ensure consistent task management across all development sessions  
**Audience**: All developers and AI assistants working on ShelfHelp AI  
**Version**: 1.2

---

## 🎯 **SESSION START PROTOCOL**

### **1. Mandatory Session Checklist**
- [ ] **Read CLAUDE.md** - Review current project state and requirements
- [ ] **Check Task Management Guide** - `docs/workflows/Task_Management_Guide.md`
- [ ] **Identify Active Tasks** - Find tasks with status 🔄 **IN PROGRESS** 
- [ ] **Review Dependencies** - Ensure prerequisites are met
- [ ] **Select Priority Task** - Choose highest priority available task
- [ ] **Load Systematic Workflow** - Reference implementation workflow for current phase

### **2. Task Selection Criteria**
- **⚡ CRITICAL**: Must complete immediately (blocking other work)
- **🔥 HIGH**: Complete within current batch (1-2 weeks)
- **⚠️ MEDIUM**: Complete within current phase (1-2 months)
- **📍 LOW**: Nice to have, flexible timing

### **3. Session Context Loading**
```markdown
**Current Phase**: [Phase Number] - [Phase Name]
**Active Batch**: [Batch Number] - [Batch Name]  
**Selected Task**: [Task ID] - [Task Name]
**Dependencies**: [List any blocking requirements]
**Estimated Time**: [Hours/Days]
**Risk Level**: [High/Medium/Low]
**Parallel Opportunities**: [List tasks that can run simultaneously]
```

---

## 🔄 **TASK EXECUTION PROTOCOL**

### **1. Task Initiation**
- **Update Status**: Change task status to 🔄 **IN PROGRESS**
- **Assign Ownership**: Add assignee name/session ID
- **Record Start Time**: Note when work begins
- **Check Success Criteria**: Review what constitutes completion

### **2. Development Process**
- **Follow CLAUDE.md Guidelines**: Adhere to code style and quality standards
- **Use Systematic Workflow**: Reference phase-specific implementation patterns
- **Apply SuperClaude Commands**: Use documented commands for consistent execution
- **Make Incremental Progress**: Small, focused changes over large rewrites
- **Document Changes**: Update relevant files as work progresses
- **Test Frequently**: Validate changes with sample data
- **Monitor Performance**: Track response times and quality metrics

### **3. Progress Tracking**
- **Status Updates**: Update task status as work progresses
- **Blocker Identification**: Mark tasks as ⏳ **BLOCKED** if dependencies fail
- **Time Tracking**: Monitor actual vs. estimated time
- **Quality Validation**: Ensure all success criteria are met

---

## ✅ **TASK COMPLETION PROTOCOL**

### **1. Completion Checklist**
- [ ] **All Success Criteria Met** - Verify each requirement is satisfied
- [ ] **Tests Passing** - Run relevant tests and validate results
- [ ] **Performance Targets Met** - Verify response times and quality metrics
- [ ] **Documentation Updated** - Update code comments and knowledge files
- [ ] **Dependencies Satisfied** - Ensure dependent tasks can proceed
- [ ] **Quality Gates Passed** - Meet all quality standards
- [ ] **Security Validation** - Confirm security requirements are met

### **2. Status Updates**
- **Mark Task Complete**: Update status to ✅ **COMPLETED**
- **Update Progress Metrics**: Increment completion counts
- **Record Completion Time**: Note actual time spent
- **Add Completion Notes**: Document any important learnings

### **3. Batch/Phase Progression**
- **Check Batch Status**: Determine if batch is complete
- **Update Phase Progress**: Recalculate phase completion percentage
- **Plan Next Task**: Identify next priority task
- **Communicate Status**: Update team on progress

---

## 🚫 **TASK BLOCKING PROTOCOL**

### **1. Blocker Identification**
- **Document Issue**: Clearly describe the blocking problem
- **Identify Resolution**: Determine what needs to happen to unblock
- **Update Status**: Change to ⏳ **BLOCKED**
- **Escalate if Needed**: Alert team of critical blockers

### **2. Blocker Resolution**
- **Track Resolution Efforts**: Monitor attempts to resolve
- **Update Dependencies**: Modify dependent tasks if needed
- **Communicate Progress**: Keep team informed of resolution efforts
- **Resume Work**: Change status back to 🔄 **IN PROGRESS** when resolved

---

## 🔄 **SESSION END PROTOCOL**

### **1. Session Wrap-up**
- **Save Progress**: Ensure all work is saved and documented
- **Update Task Status**: Reflect current state accurately
- **Document Blockers**: Record any issues that prevent completion
- **Plan Next Session**: Identify next steps for continuation

### **2. Knowledge Transfer**
- **Update Documentation**: Ensure knowledge files are current
- **Record Decisions**: Document important architectural or design choices
- **Share Learnings**: Note any insights for future sessions
- **Clean Up**: Remove temporary files and organize workspace

### **3. Handoff Preparation**
- **Clear Status**: Ensure task status reflects actual progress
- **Dependency Updates**: Update any changed dependencies
- **Context Notes**: Leave clear notes for next session
- **Commit Preparation**: Generate git commit command if work is complete

---

## 📋 **TASK MANAGEMENT GUIDE INTEGRATION**

### **1. Guide Structure Navigation**
- **Phase Overview**: Understand current phase objectives
- **Batch Details**: Review current batch tasks and dependencies
- **Task Breakdown**: Examine individual task requirements
- **Progress Tracking**: Monitor completion percentages

### **2. Status Management**
- **Consistent Updates**: Always update task status when changed
- **Accurate Tracking**: Reflect actual progress, not desired progress
- **Clear Communication**: Use standard status indicators
- **Regular Reviews**: Check guide accuracy frequently

### **3. Dependency Management**
- **Prerequisite Validation**: Verify all dependencies before starting
- **Blocking Communication**: Clearly communicate when blocked
- **Parallel Opportunities**: Identify tasks that can run simultaneously
- **Critical Path**: Understand impact of delays on overall timeline
- **Risk Assessment**: Evaluate task complexity and potential issues
- **Mitigation Strategies**: Plan for potential blockers and workarounds

---

## 🎯 **QUALITY ASSURANCE**

### **1. Code Quality Standards**
- **Follow Existing Patterns**: Maintain consistency with codebase
- **Comprehensive Testing**: Test all changes thoroughly
- **Error Handling**: Implement robust error handling
- **Documentation**: Keep documentation current

### **2. Task Quality Standards**
- **Complete Success Criteria**: Meet all defined requirements
- **Validate Dependencies**: Ensure dependent tasks can proceed
- **Quality Gates**: Pass all quality checks
- **Evidence**: Provide proof of completion

### **3. Process Quality Standards**
- **Accurate Tracking**: Maintain precise task status
- **Clear Communication**: Document progress and blockers
- **Timely Updates**: Update status promptly
- **Continuous Improvement**: Learn from each session

---

## 🔧 **TROUBLESHOOTING**

### **Common Issues**
- **Task Not Found**: Check phase/batch structure in guide
- **Status Confusion**: Refer to status indicator definitions
- **Dependency Issues**: Review dependency section in guide
- **Progress Discrepancy**: Verify actual vs. recorded progress

### **Escalation Process**
- **Technical Issues**: Document and seek technical review
- **Process Issues**: Refer to workflow documentation
- **Resource Issues**: Escalate to project leadership
- **Timeline Issues**: Adjust estimates and communicate impact

---

## 📈 **SUCCESS METRICS**

### **Session Efficiency**
- **Task Completion Rate**: Percentage of started tasks completed
- **Accuracy**: Alignment between planned and actual progress
- **Quality**: Tasks passing all success criteria
- **Velocity**: Tasks completed per session

### **Project Health**
- **Phase Progress**: Percentage of phase tasks completed
- **Batch Velocity**: Time to complete each batch
- **Blocker Resolution**: Time to resolve blocking issues
- **Quality Metrics**: Defect rate and rework percentage

---

## 📝 **TEMPLATES**

### **Session Start Template**
```markdown
## Session Start - [Date]
**Phase**: [Current Phase]  
**Batch**: [Current Batch]  
**Selected Task**: [Task ID] - [Task Name]  
**Status**: Changed to 🔄 IN PROGRESS  
**Estimated Time**: [Hours]  
**Risk Level**: [High/Medium/Low]
**Dependencies**: [List]  
**Success Criteria**: [List]  
**SuperClaude Commands**: [Relevant commands for this task]  
**Validation Framework**: [Use unified confidence scoring if applicable]
```

### **Task Completion Template**
```markdown
## Task Completion - [Task ID]
**Completed**: [Date/Time]  
**Status**: Changed to ✅ COMPLETED  
**Actual Time**: [Hours]  
**Performance**: [Response times, quality metrics]  
**Validation Results**: [Confidence scores, false positive rates if applicable]
**Success Criteria**: All met ✅  
**Notes**: [Any important learnings]  
**Next Task**: [Next priority task]  
**Risk Mitigation**: [Any risks addressed]
```

### **Blocker Report Template**
```markdown
## Task Blocked - [Task ID]
**Blocked**: [Date/Time]  
**Status**: Changed to ⏳ BLOCKED  
**Issue**: [Description of blocking problem]  
**Resolution**: [What needs to happen]  
**Impact**: [Effect on timeline]  
**Alternative Approaches**: [Workaround options]
**Risk Level**: [High/Medium/Low]
**Escalation**: [If needed]  
```

---

**File Location**: `docs/workflows/Session_Workflow_Protocol.md`  
**Maintained By**: Development Team  
**Update Frequency**: As needed based on process improvements  
**Version**: 1.1 (Updated with Systematic Implementation Workflow)  
**Integration**: Referenced by CLAUDE.md and Task Management Guide

*This protocol ensures consistent task management and progress tracking across all development sessions, preventing task duplication and ensuring continuous project advancement. Enhanced with systematic workflow patterns, risk assessment, and SuperClaude command integration for improved efficiency and quality.*