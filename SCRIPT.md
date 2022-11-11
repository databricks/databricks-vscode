1. configure plugin
2. delete repo
3. STUCK!!!!

full sync does not clean the cache!
I can't fix a broken state by doing a full sync!

track changes to gitignore

file watcher for .databricks is not working

---

https://docs.databricks.com/dev-tools/ide-how-to.html

We hear from a lot of customers that they want to use their favourite IDE to develop for Databricks.
Today I want to share with you what we have been working on to make this easier.

A few months ago we released a demo project together with docs on IDE best practices with Datab-00ricks.

We showed how to use dbx to develop locally using and IDE and then use dbx from the command line to run code on a Databricks cluster.

While this worked well, it still had a few limitations:

1. It wasn't integrated with the IDE. You had to context switch between the IDE, the command line, and the Databricks UI
2. Using dbx for the edit-run cycle is rather slow

We have been working on a new feature that addresses these limitations.

We are happy to announce that we have released a VSCode extension for Databricks that allows you to run on Databricks code directly from your IDE.

This means that you can now develop locally using your IDE and run code directly on a Databricks cluster without having to context switch between the IDE, the command line, and the Databricks UI.

Let me show you how to use it.

Here I have the demo project from the previous documentation article open in VSCode.

Fisrt I have configured the IDE to connect to a Databricks workspace.

1. I selected an interactive cluster for running my code on
2. I created an empty repo for syncing my code to
   2.1 creat an empty repo

Let's start the sync process. Sync runs in the background and watches the file system.
Running code always happens on the cluster.

You can see the original notebook that was the starting point for the demo project.
We have taken this notebook and

1. Converted it to a python script
2. Factored out business logic into a separate file
3. Added unit tests for the business logic

> open notebook in VSCode
> show raw python script
> show refactored python script
> show library code
> show unit tests
> run unit tests - still locally
> run refactored code on cluster
> make code change
> which country do we filter by?
> goto def
> change code to NLD
> we can also run code as workflow
> let's run the original notebook
