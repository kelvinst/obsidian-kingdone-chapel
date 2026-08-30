.PHONY: all precommit check install-git-hooks
all: precommit

precommit:
	npm run precommit

check:
	npm run check

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
