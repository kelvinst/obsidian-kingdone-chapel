.PHONY: all setup precommit install-git-hooks
all: precommit

# What `.kix/hooks/session-start.sh` looks for by name, so a fresh clone
# wires its hooks the same way whether a person or an agent opened it.
setup: install-git-hooks

precommit:
	npm run precommit

# `.git` is a file rather than a directory inside a worktree, and worktrees
# share the one hooks directory, so ask git where it is rather than guessing.
install-git-hooks:
	@hooks="$$(git rev-parse --git-path hooks)"; \
	mkdir -p "$$hooks"; \
	for hook in .git-hooks/*; do \
	  cp "$$hook" "$$hooks/$$(basename "$$hook")"; \
	  chmod +x "$$hooks/$$(basename "$$hook")"; \
	  echo "Installed $$(basename "$$hook")"; \
	done
