from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('camp', '0001_initial')]
    operations = [
        migrations.AddField(model_name='challenge', name='created_at', field=models.DateTimeField(auto_now_add=True, default='2026-01-01T00:00:00Z'), preserve_default=False),
        migrations.AddField(model_name='challenge', name='is_active', field=models.BooleanField(default=True)),
        migrations.AddField(model_name='challenge', name='mission', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='challenges', to='camp.mission')),
        migrations.AddField(model_name='challenge', name='time_limit', field=models.PositiveIntegerField(default=600)),
        migrations.CreateModel(name='ChallengeQuestion', fields=[('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')), ('question_type', models.CharField(choices=[('multiple_choice','Multiple choice'),('true_false','True / false'),('drag_order','Drag order'),('match_pairs','Match pairs'),('fill_blank','Fill in the blank'),('prompt_build','Prompt build')], max_length=32)), ('order', models.PositiveIntegerField(default=0)), ('points', models.PositiveIntegerField(default=10)), ('content', models.JSONField(default=dict)), ('challenge', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='questions', to='camp.challenge'))]),
        migrations.CreateModel(name='ChallengeAttempt', fields=[('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')), ('score', models.PositiveIntegerField(default=0)), ('accuracy', models.DecimalField(decimal_places=2, default=0, max_digits=5)), ('xp_earned', models.PositiveIntegerField(default=0)), ('time_taken', models.PositiveIntegerField(default=0)), ('started_at', models.DateTimeField(auto_now_add=True)), ('completed_at', models.DateTimeField(blank=True, null=True)), ('challenge', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attempts', to='camp.challenge')), ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='challenge_attempts', to='users.student'))], options={'constraints': [models.UniqueConstraint(fields=('challenge','student'), name='one_attempt_per_challenge')]}),
    ]
